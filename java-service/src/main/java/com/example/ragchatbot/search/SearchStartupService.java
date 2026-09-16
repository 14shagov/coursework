package com.example.ragchatbot.search;

import com.example.ragchatbot.entity.SearchOutboxStatus;
import com.example.ragchatbot.entity.SearchOutboxEventType;
import com.example.ragchatbot.entity.TitleGenerationStatus;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.MessageRepository;
import com.example.ragchatbot.repository.SearchOutboxEventRepository;
import com.example.ragchatbot.repository.TitleGenerationJobRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SearchStartupService {
    private final SearchIndexService searchIndexService;
    private final SearchOutboxEventRepository outboxRepository;
    private final TitleGenerationJobRepository titleJobRepository;
    private final SearchOutboxPublisher outboxPublisher;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;

    @EventListener(ApplicationReadyEvent.class)
    public void recover() {
        boolean createdIndex = searchIndexService.initialize();
        outboxRepository.findTop100ByStatusInOrderByCreatedAtAsc(java.util.List.of(SearchOutboxStatus.RUNNING)).forEach(event -> {
            event.setStatus(SearchOutboxStatus.PENDING);
            outboxRepository.save(event);
        });
        titleJobRepository.findTop10ByStatusInOrderByCreatedAtAsc(java.util.List.of(TitleGenerationStatus.RUNNING)).forEach(job -> {
            job.setStatus(TitleGenerationStatus.PENDING);
            job.setStartedAt(null);
            titleJobRepository.save(job);
        });
        if (createdIndex) {
            conversationRepository.findAll().forEach(conversation ->
                    outboxPublisher.publish(SearchOutboxEventType.UPSERT_CONVERSATION, conversation.getId()));
            messageRepository.findAll().forEach(message ->
                    outboxPublisher.publish(SearchOutboxEventType.UPSERT_MESSAGE, message.getId()));
        }
    }
}
