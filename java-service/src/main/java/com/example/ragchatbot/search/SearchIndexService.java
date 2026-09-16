package com.example.ragchatbot.search;

import com.example.ragchatbot.dto.SearchConversationResultDto;
import com.example.ragchatbot.dto.SearchReindexJobResponseDto;
import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.Message;
import com.example.ragchatbot.entity.SearchOutboxEvent;
import com.example.ragchatbot.entity.SearchOutboxEventType;
import com.example.ragchatbot.entity.SearchOutboxStatus;
import com.example.ragchatbot.entity.SearchReindexJob;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.MessageRepository;
import com.example.ragchatbot.repository.SearchOutboxEventRepository;
import com.example.ragchatbot.repository.SearchReindexJobRepository;
import com.example.ragchatbot.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Slf4j
public class SearchIndexService {
    private final ElasticsearchGateway gateway;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final SearchOutboxEventRepository outboxRepository;
    private final SearchReindexJobRepository reindexJobRepository;
    private final UserRepository userRepository;
    private final ReentrantReadWriteLock indexLock = new ReentrantReadWriteLock();

    public boolean enabled() {
        return gateway.enabled();
    }

    public boolean initialize() {
        if (!enabled()) return false;
        try {
            return gateway.ensureAlias();
        } catch (Exception exception) {
            log.warn("[search] Elasticsearch unavailable during startup: {}", exception.getClass().getSimpleName());
            return false;
        }
    }

    @Transactional(readOnly = true)
    public List<SearchConversationResultDto> search(long userId, String query) {
        if (!enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Search is disabled");
        String text = query == null ? "" : query.trim();
        if (text.length() < 2) return List.of();
        if (text.length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search query is too long");
        }
        try {
            JsonNode root = gateway.search(searchBody(userId, text));
            Map<Long, SearchConversationResultDto> results = new LinkedHashMap<>();
            for (JsonNode hit : root.path("hits").path("hits")) {
                JsonNode source = hit.path("_source");
                Long conversationId = longValue(source, "conversationId");
                if (conversationId == null || results.containsKey(conversationId)) continue;
                Conversation conversation = conversationRepository.findByIdAndUserId(conversationId, userId).orElse(null);
                if (conversation == null) continue;
                boolean messageHit = "message".equals(source.path("kind").asText());
                results.put(conversationId, new SearchConversationResultDto(
                        conversationId,
                        conversation.getTitle(),
                        messageHit ? "MESSAGE" : "TITLE",
                        highlight(hit, messageHit ? "content" : "title"),
                        messageHit ? longValue(source, "messageId") : null,
                        conversation.getLastMessageAt()));
            }
            return List.copyOf(results.values());
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            log.warn("[search] query failed: {}", exception.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Search is temporarily unavailable");
        }
    }

    @Transactional
    public void apply(SearchOutboxEvent event, String targetIndex) {
        indexLock.readLock().lock();
        try {
            String index = targetIndex == null ? alias() : targetIndex;
            List<SearchDocument> documents = documentsFor(event);
            if (!documents.isEmpty()) gateway.bulkUpsert(index, documents);
        } finally {
            indexLock.readLock().unlock();
        }
    }

    @Transactional
    public Long startReindex(long requestedByUserId) {
        if (!enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Search is disabled");
        if (!userRepository.existsById(requestedByUserId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User is not available");
        }
        SearchReindexJob job = new SearchReindexJob();
        job.setRequestedByUserId(requestedByUserId);
        job.setStatus(SearchOutboxStatus.PENDING);
        job.setCreatedAt(Instant.now());
        return reindexJobRepository.save(job).getId();
    }

    @Transactional(readOnly = true)
    public SearchReindexJobResponseDto getReindexJob(long id) {
        SearchReindexJob job = reindexJobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Search reindex job not found"));
        return toJobDto(job);
    }

    @Transactional
    public void runReindex(long jobId) {
        SearchReindexJob job = reindexJobRepository.findById(jobId).orElse(null);
        if (job == null || job.getStatus() != SearchOutboxStatus.PENDING) return;
        job.setStatus(SearchOutboxStatus.RUNNING);
        job.setStartedAt(Instant.now());
        reindexJobRepository.save(job);
        Instant watermark = job.getStartedAt();
        String target = alias() + "-r" + jobId;
        try {
            gateway.createIndex(target);
            List<SearchDocument> documents = allDocuments();
            job.setTotalDocuments(documents.size());
            for (int from = 0; from < documents.size(); from += 100) {
                List<SearchDocument> batch = documents.subList(from, Math.min(from + 100, documents.size()));
                gateway.bulkUpsert(target, batch);
                job.setProcessedDocuments(job.getProcessedDocuments() + batch.size());
                reindexJobRepository.save(job);
            }
            indexLock.writeLock().lock();
            try {
                for (SearchOutboxEvent event : outboxRepository.findByCreatedAtGreaterThanEqualOrderByCreatedAtAsc(watermark)) {
                    applyInsideWriteLock(event, target);
                }
                gateway.refresh(target);
                gateway.setAlias(target);
            } finally {
                indexLock.writeLock().unlock();
            }
            job.setStatus(SearchOutboxStatus.COMPLETED);
            job.setCompletedAt(Instant.now());
        } catch (Exception exception) {
            job.setStatus(SearchOutboxStatus.FAILED);
            job.setErrorMessage("Search reindex failed");
            job.setCompletedAt(Instant.now());
            log.error("[search-reindex] failed jobId={}, type={}", jobId, exception.getClass().getSimpleName());
        }
        reindexJobRepository.save(job);
    }

    private void applyInsideWriteLock(SearchOutboxEvent event, String target) {
        List<SearchDocument> documents = documentsFor(event);
        if (!documents.isEmpty()) gateway.bulkUpsert(target, documents);
    }

    private List<SearchDocument> allDocuments() {
        List<SearchDocument> documents = new ArrayList<>();
        conversationRepository.findAll().forEach(conversation -> documents.add(conversationDocument(conversation)));
        messageRepository.findAll().forEach(message -> documents.add(messageDocument(message)));
        return documents;
    }

    private List<SearchDocument> documentsFor(SearchOutboxEvent event) {
        if (event.getEventType() == SearchOutboxEventType.UPSERT_CONVERSATION) {
            return conversationRepository.findById(event.getAggregateId()).map(value -> List.of(conversationDocument(value))).orElseGet(List::of);
        }
        if (event.getEventType() == SearchOutboxEventType.UPSERT_MESSAGE) {
            return messageRepository.findById(event.getAggregateId()).map(value -> List.of(messageDocument(value))).orElseGet(List::of);
        }
        return List.of();
    }

    private SearchDocument conversationDocument(Conversation conversation) {
        return new SearchDocument("conversation-" + conversation.getId(), Map.of(
                "kind", "conversation",
                "userId", String.valueOf(conversation.getUser().getId()),
                "conversationId", String.valueOf(conversation.getId()),
                "title", conversation.getTitle(),
                "lastMessageAt", conversation.getLastMessageAt() == null ? conversation.getCreatedAt().toString() : conversation.getLastMessageAt().toString(),
                "createdAt", conversation.getCreatedAt().toString()));
    }

    private SearchDocument messageDocument(Message message) {
        return new SearchDocument("message-" + message.getId(), Map.of(
                "kind", "message",
                "userId", String.valueOf(message.getConversation().getUser().getId()),
                "conversationId", String.valueOf(message.getConversation().getId()),
                "messageId", String.valueOf(message.getId()),
                "role", message.getRole().name(),
                "content", message.getContent(),
                "createdAt", message.getCreatedAt().toString()));
    }

    private Map<String, Object> searchBody(long userId, String query) {
        return Map.of(
                "size", 20,
                "query", Map.of("bool", Map.of(
                        "filter", List.of(Map.of("term", Map.of("userId", String.valueOf(userId)))),
                        "must", List.of(Map.of("multi_match", Map.of("query", query, "fields", List.of("title^8", "content")))))),
                "collapse", Map.of("field", "conversationId"),
                "highlight", Map.of("pre_tags", List.of("<em>"), "post_tags", List.of("</em>"), "fields", Map.of(
                        "title", Map.of("number_of_fragments", 0),
                        "content", Map.of("fragment_size", 160, "number_of_fragments", 1))));
    }

    private String highlight(JsonNode hit, String field) {
        JsonNode fragments = hit.path("highlight").path(field);
        return fragments.isArray() && !fragments.isEmpty() ? fragments.get(0).asText() : null;
    }

    private Long longValue(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        try {
            return value == null ? null : Long.valueOf(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String alias() {
        return gateway.alias();
    }

    private SearchReindexJobResponseDto toJobDto(SearchReindexJob job) {
        return new SearchReindexJobResponseDto(job.getId(), job.getStatus(), job.getTotalDocuments(),
                job.getProcessedDocuments(), job.getFailedDocuments(), job.getErrorMessage(), job.getCreatedAt(),
                job.getStartedAt(), job.getCompletedAt());
    }
}
