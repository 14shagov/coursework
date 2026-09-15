package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.dto.ChatMessageDto;
import com.example.ragchatbot.dto.ChatRequestDto;
import com.example.ragchatbot.dto.ChatResponseDto;
import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageDto;
import com.example.ragchatbot.dto.StreamingChatChunk;
import com.example.ragchatbot.entity.User;
import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.Message;
import com.example.ragchatbot.dto.MessageRole;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.UserRepository;
import com.example.ragchatbot.repository.MessageRepository;
import com.example.ragchatbot.service.ChatService;
import com.example.ragchatbot.service.ChatModelCatalog;
import com.example.ragchatbot.dto.ConversationMode;
import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.client.PythonStreamingClient;
import com.example.ragchatbot.service.RagService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private record PreparedRagResponse(RagContextResultDto context, ChatRequestDto request) {
        boolean hasContext() {
            return request != null;
        }

        int foundChunks() {
            return context.getFoundChunks();
        }

        int usedChunks() {
            return context.getUsedChunks();
        }

        Double bestScore() {
            return context.getBestScore();
        }

        double threshold() {
            return context.getThreshold();
        }
    }

    private final PythonServiceClient pythonServiceClient;
    private final PythonStreamingClient pythonStreamingClient;
    private final RagService ragService;
    private final ConversationRepository conversationRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final ChatModelCatalog chatModelCatalog;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${chat.rag.top-k:5}")
    private int ragTopK;

    @Value("${chat.max-history-messages:20}")
    private int maxHistoryMessages;

    @Override
    public ConversationResponseDto createConversation(Long userId, String title, ConversationMode conversationMode,
                                                      String llmModel) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));
        Conversation conversation = new Conversation();
        conversation.setUser(user);
        conversation.setMode(conversationMode);
        conversation.setTitle(title);
        conversation.setLlmModel(chatModelCatalog.resolve(llmModel));
        conversation.setCreatedAt(Instant.now());
        Conversation saved = conversationRepository.save(conversation);
        log.info("[chat-service] createConversation saved conversationId={}, userId={}, mode={}, title={}",
                saved.getId(), userId, conversationMode, title);
        return toConversationResponse(saved);
    }

    @Override
    @Transactional
    public MessageResponseDto sendMessage(Long userId, Long conversationId, String content) {
        Conversation conversation = ownedConversation(userId, conversationId);
        String traceId = UUID.randomUUID().toString();
        log.info("[chat-service] sendMessage:start traceId={}, conversationId={}, mode={}, contentLength={}",
                traceId,
                conversationId,
                conversation.getMode(), content.length());
        ConversationMode requestedMode = conversation.getMode();
        String llmModel = chatModelCatalog.resolve(conversation.getLlmModel());

        // Сохраняем пользовательское сообщение
        saveMessage(conversation, MessageRole.USER, content, null);

        MessageResponseDto response;
        if (requestedMode == ConversationMode.RAG) {
            log.info("[chat-service] sendMessage:route=RAG traceId={}, conversationId={}", traceId, conversationId);
            response = handleRag(conversationId, content, traceId, llmModel);
        } else {
            log.info("[chat-service] sendMessage:route=PLAIN traceId={}, conversationId={}", traceId, conversationId);
            response = handlePlain(conversationId, content, traceId, llmModel);
        }

        // Сохраняем ответ ассистента
        saveMessage(conversation, MessageRole.ASSISTANT, response.getContent(), nullIfBlank(response.getThinking()));

        log.info("[chat-service] sendMessage:done traceId={}, conversationId={}, responseLength={}",
                traceId, conversationId, response.getContent().length());
        return response;
    }

    @Override
    @Transactional
    public Flux<StreamingChatChunk> sendMessageStreaming(Long userId, Long conversationId, String content) {
        Conversation conversation = ownedConversation(userId, conversationId);
        String traceId = UUID.randomUUID().toString();
        String llmModel = chatModelCatalog.resolve(conversation.getLlmModel());
        log.info("[chat-service] sendMessageStreaming:start traceId={}, conversationId={}, mode={}",
                traceId, conversationId, conversation.getMode());

        // Сохраняем пользовательское сообщение
        saveMessage(conversation, MessageRole.USER, content, null);

        Flux<StreamingChatChunk> stream;
        if (conversation.getMode() == ConversationMode.RAG) {
            log.info("[chat-service] sendMessageStreaming:route=RAG traceId={}, conversationId={}", traceId, conversationId);
            stream = handleRagStreaming(conversationId, content, traceId, llmModel);
        } else {
            log.info("[chat-service] sendMessageStreaming:route=PLAIN traceId={}, conversationId={}", traceId, conversationId);
            stream = handlePlainStreaming(conversationId, content, traceId, llmModel);
        }

        AtomicReference<StringBuilder> answer = new AtomicReference<>(new StringBuilder());
        AtomicReference<StringBuilder> thinking = new AtomicReference<>(new StringBuilder());
        return stream
                .doOnNext(chunk -> {
                    if (chunk.getType() == StreamingChatChunk.Type.CONTENT && chunk.getContent() != null) {
                        answer.get().append(chunk.getContent());
                    }
                    if (chunk.getType() == StreamingChatChunk.Type.THINKING && chunk.getThinking() != null) {
                        thinking.get().append(chunk.getThinking());
                    }
                })
                .doOnComplete(() -> {
                    if (!answer.get().isEmpty()) {
                        saveMessage(conversation, MessageRole.ASSISTANT, answer.get().toString(),
                                nullIfBlank(thinking.get().toString()));
                    }
                })
                .doOnComplete(() -> log.debug("[chat-service] sendMessageStreaming:complete traceId={}", traceId))
                .doOnError(error -> log.error("[chat-service] sendMessageStreaming:error traceId={}", traceId, error))
                .onErrorResume(error -> {
                    return Flux.just(StreamingChatChunk.error("Не удалось сформировать ответ. Попробуйте ещё раз."));
                });
    }

    /**
     * PLAIN streaming: uses real LLM streaming.
     * Yields reasoning chunks as THINKING type, content chunks as DONE with content, then DONE with nulls.
     */
    private Flux<StreamingChatChunk> handlePlainStreaming(Long conversationId, String userMessage, String traceId,
                                                           String llmModel) {
        log.info("[chat-service] handlePlainStreaming conversationId={}", conversationId);

        ChatRequestDto request = buildChatRequest(conversationId, null, llmModel);

        // Use streaming endpoint — each SSE event is: data: {"type":"reasoning|content|done","text":"..."}
        Flux<String> rawStream = pythonStreamingClient.chatStreaming(request)
                .timeout(Duration.ofMinutes(5));

        return failOnUpstreamError(parseStreamingResponse(rawStream))
                .concatWith(Flux.just(doneChunk(false, false, 0, 0, null, null)))
                .doOnComplete(() -> log.info("[chat-service] handlePlainStreaming:done traceId={}", traceId));
    }

    /** Parse decoded SSE data events into StreamingChatChunks. */
    private Flux<StreamingChatChunk> parseStreamingResponse(Flux<String> rawStream) {
        return rawStream
                .flatMap(event -> Mono.justOrEmpty(parseSseEvent(event)));
    }

    /**
     * Parse a single SSE event into a StreamingChatChunk.
     * Expected format: data: {"type":"reasoning|content|done","text":"..."}
     */
    private StreamingChatChunk parseSseEvent(String event) {
        if (event == null) return null;
        String line = event.trim();
        if (line.startsWith("data: ")) {
            line = line.substring(6);
        } else if (line.startsWith("data:")) {
            line = line.substring(5);
        }
        line = line.trim();
        if (line.isEmpty() || line.equals("[DONE]")) {
            return null;
        }
        try {
            JsonNode json = objectMapper.readTree(line);
            String type = json.get("type").asText();
            String text = json.has("text") ? json.get("text").asText() : null;

            if ("reasoning".equals(type)) {
                return new StreamingChatChunk(
                        StreamingChatChunk.Type.THINKING, text, null,
                        false, false, 0, 0, 0, null, null, null, null);
            } else if ("content".equals(type)) {
                return new StreamingChatChunk(
                        StreamingChatChunk.Type.CONTENT, null, text,
                        false, false, 0, 0, 0, null, null, null, null);
            } else if ("error".equals(type)) {
                return StreamingChatChunk.error("LLM stream failed");
            } else if ("done".equals(type)) {
                return null;
            }
        } catch (Exception e) {
            log.debug("[chat-service] parseSseEvent:skip line={}", line);
        }
        return null;
    }

    /**
     * RAG streaming: эмбеддинг + поиск → real LLM streaming (reasoning + content).
     */
    private Flux<StreamingChatChunk> handleRagStreaming(Long conversationId, String userMessage, String traceId,
                                                         String llmModel) {
        log.info("[chat-service] handleRagStreaming:start traceId={}", traceId);

        return Flux.just(ragStep("embedding", "start"))
                .concatWith(Mono.fromCallable(() -> ragService.createQueryEmbedding(userMessage, traceId))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMapMany(embedding -> Flux.just(
                                        ragStep("embedding", "done"),
                                        ragStep("search", "start"))
                                .concatWith(Mono.fromCallable(() -> ragService.searchContext(embedding, ragTopK, traceId))
                                        .subscribeOn(Schedulers.boundedElastic())
                                        .flatMapMany(contextResult -> continueRagStreaming(
                                                conversationId, contextResult, traceId, llmModel)))));
    }

    private Flux<StreamingChatChunk> continueRagStreaming(Long conversationId, RagContextResultDto contextResult,
                                                            String traceId, String llmModel) {
        PreparedRagResponse prepared = prepareRagResponse(conversationId, contextResult, traceId, llmModel);
        int chunksFound = prepared.foundChunks();
        int usedChunks = prepared.usedChunks();
        Double bestScore = prepared.bestScore();
        double threshold = prepared.threshold();

        log.info("[chat-service] handleRagStreaming:retrieved traceId={}, chunksFound={}, usedChunks={}",
                traceId, chunksFound, usedChunks);

        Flux<StreamingChatChunk> searchDone = Flux.just(
                ragStep("search", "done"),
                new StreamingChatChunk(StreamingChatChunk.Type.RAG_SEARCH, null, null,
                        true, prepared.hasContext(), chunksFound, usedChunks, chunksFound,
                        bestScore, threshold, null, null),
                ragStep("generation", "start"));

        if (!prepared.hasContext()) {
            String noDataMessage = "Данные в базе знаний не найдены по вашему запросу. Уточните вопрос или добавьте релевантные материалы.";
            return searchDone.concatWithValues(
                    new StreamingChatChunk(StreamingChatChunk.Type.CONTENT, null, noDataMessage,
                            true, false, chunksFound, usedChunks, chunksFound, bestScore, threshold, null, null),
                    ragStep("generation", "done"),
                    doneChunk(true, false, chunksFound, usedChunks, bestScore, threshold));
        }

        Flux<StreamingChatChunk> llmStream = failOnUpstreamError(parseStreamingResponse(
                pythonStreamingClient.chatStreaming(prepared.request()).timeout(Duration.ofMinutes(5))));

        return searchDone
                .concatWith(llmStream)
                .concatWithValues(ragStep("generation", "done"),
                        doneChunk(true, true, chunksFound, usedChunks, bestScore, threshold))
                .doOnComplete(() -> log.info("[chat-service] handleRagStreaming:done traceId={}", traceId));
    }

    private StreamingChatChunk ragStep(String step, String status) {
        return new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null,
                false, false, 0, 0, 0, null, null, step, status);
    }

    /**
     * Универсальный метод генерации thinking-текста.
     */
    private String generateThinkingText(String userMessage, boolean isRag) {
        String analysis = "Пользователь спрашивает: «" + truncate(userMessage, 60) + "»\n\n";
        if (!isRag) {
            return analysis + "Генерирую ответ на основе базовых знаний.";
        }
        return analysis + "**Тип вопроса:** определение.\n" +
                "Формирую ответ из найденных источников.";
    }

    /**
     * Thinking-текст для RAG-режима с деталями по чанкам.
     */
    private String generateRagThinkingText(String userMessage, RagContextResultDto contextResult) {
        return generateThinkingText(userMessage, true) + "\n\n" +
                "1. Эмбеддинг запроса (dim=3072) готов.\n" +
                "2. Поиск по БД: top-5, порог → " + contextResult.getFoundChunks() + " чанка.\n" +
                "3. Источники: проанализировано " + contextResult.getUsedChunks() + " чанков.\n" +
                "4. Формирую ответ из контекста.";
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }

    private StreamingChatChunk doneChunk(boolean usedRag, boolean usedContext, int foundChunks,
                                         int usedChunks, Double bestScore, Double threshold) {
        return new StreamingChatChunk(
                StreamingChatChunk.Type.DONE, null, null,
                usedRag, usedContext, foundChunks, usedChunks, foundChunks,
                bestScore, threshold, null, null);
    }

    private Flux<StreamingChatChunk> failOnUpstreamError(Flux<StreamingChatChunk> stream) {
        return stream.handle((chunk, sink) -> {
            if (chunk.getType() == StreamingChatChunk.Type.ERROR) {
                sink.error(new IllegalStateException(chunk.getError()));
            } else {
                sink.next(chunk);
            }
        });
    }

    private ChatRequestDto buildChatRequest(Long conversationId, List<String> contextChunks, String llmModel) {
        List<Message> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        List<Message> retainedHistory = history;
        if (history.size() > maxHistoryMessages) {
            int keep = maxHistoryMessages / 2;
            retainedHistory = history.subList(history.size() - keep, history.size());
            log.info("[chat-service] history:trimmed conversationId={}, total={}, kept={}",
                    conversationId, history.size(), keep);
        }
        ChatRequestDto request = new ChatRequestDto();
        request.setMessages(retainedHistory.stream()
                .map(message -> new ChatMessageDto(message.getRole().name().toLowerCase(), message.getContent()))
                .toList());
        request.setContextChunks(contextChunks);
        request.setLlmModel(llmModel);
        return request;
    }

    private PreparedRagResponse prepareRagResponse(Long conversationId, RagContextResultDto context,
                                                     String traceId, String llmModel) {
        if (context.getUsedChunks() == 0) {
            return new PreparedRagResponse(context, null);
        }

        String contextPrompt = ragService.buildContextPrompt(context.getChunks(), traceId);
        List<String> contextChunks = contextPrompt == null || contextPrompt.isBlank()
                ? List.of()
                : List.of(contextPrompt);
        return new PreparedRagResponse(context, buildChatRequest(conversationId, contextChunks, llmModel));
    }

    private Conversation ownedConversation(Long userId, Long conversationId) {
        return conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));
    }

    private void saveMessage(Conversation conversation, MessageRole role, String content, String thinking) {
        Message message = new Message();
        message.setConversation(conversation);
        message.setRole(role);
        message.setContent(content);
        message.setThinking(thinking);
        message.setCreatedAt(Instant.now());
        messageRepository.save(message);
        log.debug("[chat-service] message saved conversationId={}, role={}", conversation.getId(), role);
    }

    private String nullIfBlank(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private MessageResponseDto handlePlain(Long conversationId, String userMessage, String traceId, String llmModel) {
        log.info("[chat-service] handlePlain conversationId={}, userMessageLength={}",
                conversationId, userMessage == null ? 0 : userMessage.length());
        String thinkingText = generateThinkingText(userMessage, false);
        ChatResponseDto llmResponse = callLlmWithHistory(conversationId, null, llmModel);
        String answer = llmResponse.getContent() == null ? "" : llmResponse.getContent();
        String thinking = llmResponse.getThinking();
        if (thinking == null || thinking.isBlank()) {
            thinking = thinkingText;
        }
        return new MessageResponseDto(answer, thinking, conversationId, false, false, 0, 0, null, null);
    }

    private MessageResponseDto handleRag(Long conversationId, String userMessage, String traceId, String llmModel) {
        int requestLength = userMessage == null ? 0 : userMessage.length();
        log.info("[chat-service] handleRag:start traceId={}, conversationId={}, userMessageLength={}, topK={}",
                traceId, conversationId, requestLength, ragTopK);

        PreparedRagResponse prepared = prepareRagResponse(
                conversationId, ragService.retrieveContext(userMessage, ragTopK, traceId), traceId, llmModel);
        RagContextResultDto contextResult = prepared.context();
        int chunksFound = prepared.foundChunks();
        int usedChunks = prepared.usedChunks();
        Double bestScore = prepared.bestScore();
        double threshold = prepared.threshold();

        log.info("[chat-service] handleRag:retrieved traceId={}, conversationId={}, chunksFound={}, usedChunks={}, bestScore={}, threshold={}, fallbackWithoutContext={}",
                traceId, conversationId, chunksFound, usedChunks, bestScore, threshold, !prepared.hasContext());

        if (!prepared.hasContext()) {
            String noDataMessage = "Данные в базе знаний не найдены по вашему запросу. Уточните вопрос или добавьте релевантные материалы.";
            return new MessageResponseDto(noDataMessage, "", conversationId, true, false, chunksFound, usedChunks, bestScore, threshold);
        }

        ChatResponseDto llmResponse = callLlm(prepared.request());
        String llmAnswer = llmResponse.getContent() == null ? "" : llmResponse.getContent();
        String thinkingText = llmResponse.getThinking();
        if (thinkingText == null || thinkingText.isBlank()) {
            thinkingText = generateRagThinkingText(userMessage, contextResult);
        }
        return new MessageResponseDto(llmAnswer, thinkingText, conversationId, true, true, chunksFound, usedChunks, bestScore, threshold);
    }

    private ChatResponseDto callLlmWithHistory(Long conversationId, List<String> contextChunks, String llmModel) {
        return callLlm(buildChatRequest(conversationId, contextChunks, llmModel));
    }

    private ChatResponseDto callLlm(ChatRequestDto request) {
        ChatResponseDto response = pythonServiceClient.chat(request);
        if (response == null) {
            response = new ChatResponseDto();
            response.setContent("");
            response.setThinking(null);
        }
        return response;
    }

    @Override
    public ConversationResponseDto getConversation(Long userId, Long id) {
        Conversation conversation = ownedConversation(userId, id);
        return toConversationResponse(conversation);
    }

    @Override
    public List<ConversationResponseDto> listConversations(Long userId) {
        return conversationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toConversationResponse)
                .toList();
    }

    @Override
    @Transactional
    public ConversationResponseDto updateConversationModel(Long userId, Long conversationId, String llmModel) {
        Conversation conversation = ownedConversation(userId, conversationId);
        conversation.setLlmModel(chatModelCatalog.resolve(llmModel));
        return toConversationResponse(conversationRepository.save(conversation));
    }

    @Override
    public List<com.example.ragchatbot.dto.ChatModelDto> getChatModels() {
        return chatModelCatalog.availableModels();
    }

    @Override
    public List<MessageDto> getHistory(Long userId, Long conversationId) {
        ownedConversation(userId, conversationId);
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                .map(m -> new MessageDto(m.getId(), m.getRole().name(), m.getContent(), m.getThinking(), m.getCreatedAt()))
                .toList();
    }

    private ConversationResponseDto toConversationResponse(Conversation conversation) {
        return new ConversationResponseDto(conversation.getId(), conversation.getUser().getId(), conversation.getMode().name(),
                conversation.getTitle(), conversation.getCreatedAt(), chatModelCatalog.resolve(conversation.getLlmModel()));
    }
}
