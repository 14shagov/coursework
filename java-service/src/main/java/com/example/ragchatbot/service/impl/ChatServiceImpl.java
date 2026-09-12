package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.dto.MessageRequestDto;
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
import com.example.ragchatbot.dto.ConversationMode;
import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.service.RagService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private final PythonServiceClient pythonServiceClient;
    private final RagService ragService;
    private final ConversationRepository conversationRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;

    @Value("${chat.rag.top-k:5}")
    private int ragTopK;

    @Value("${chat.max-history-messages:20}")
    private int maxHistoryMessages;

    @Override
    public ConversationResponseDto createConversation(Long userId, String title, String mode) {
        ConversationMode conversationMode = ConversationMode.valueOf(mode);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));
        Conversation conversation = new Conversation();
        conversation.setUser(user);
        conversation.setMode(conversationMode);
        conversation.setTitle(title);
        conversation.setCreatedAt(Instant.now());
        Conversation saved = conversationRepository.save(conversation);
        log.info("[chat-service] createConversation saved conversationId={}, userId={}, mode={}, title={}",
                saved.getId(), userId, mode, title);
        return new ConversationResponseDto(saved.getId(), saved.getUser().getId(), saved.getMode().name(), saved.getTitle(), saved.getCreatedAt());
    }

    @Override
    @Transactional
    public MessageResponseDto sendMessage(Long conversationId, MessageRequestDto request) {
        String traceId = UUID.randomUUID().toString();
        log.info("[chat-service] sendMessage:start traceId={}, conversationId={}, mode={}, contentLength={}",
                traceId,
                conversationId,
                request.getMode(),
                request.getContent() == null ? 0 : request.getContent().length());
        ConversationMode requestedMode = request.getMode();

        // Сохраняем пользовательское сообщение
        saveMessage(conversationId, MessageRole.USER, request.getContent());

        MessageResponseDto response;
        if (requestedMode == ConversationMode.RAG) {
            log.info("[chat-service] sendMessage:route=RAG traceId={}, conversationId={}", traceId, conversationId);
            response = handleRag(conversationId, request.getContent(), traceId);
        } else {
            log.info("[chat-service] sendMessage:route=PLAIN traceId={}, conversationId={}", traceId, conversationId);
            response = handlePlain(conversationId, request.getContent());
        }

        // Сохраняем ответ ассистента
        saveMessage(conversationId, MessageRole.ASSISTANT, response.getContent());

        log.info("[chat-service] sendMessage:done traceId={}, conversationId={}, responseLength={}",
                traceId, conversationId, response.getContent().length());
        return response;
    }

    @Override
    @Transactional
    public Flux<StreamingChatChunk> sendMessageStreaming(Long conversationId, MessageRequestDto request) {
        String traceId = UUID.randomUUID().toString();
        log.info("[chat-service] sendMessageStreaming:start traceId={}, conversationId={}, mode={}",
                traceId, conversationId, request.getMode());

        // Сохраняем пользовательское сообщение
        saveMessage(conversationId, MessageRole.USER, request.getContent());

        Flux<StreamingChatChunk> stream;
        if (request.getMode() == ConversationMode.RAG) {
            log.info("[chat-service] sendMessageStreaming:route=RAG traceId={}, conversationId={}", traceId, conversationId);
            stream = handleRagStreaming(conversationId, request.getContent(), traceId);
        } else {
            log.info("[chat-service] sendMessageStreaming:route=PLAIN traceId={}, conversationId={}", traceId, conversationId);
            stream = handlePlainStreaming(conversationId, request.getContent(), traceId);
        }

        return stream.doOnTerminate(() -> {
            // no-op: assistant message is now saved explicitly in handlers or on error path if needed
        });
    }

    /**
     * PLAIN streaming: отправляем thinking чанки, потом DONE с ответом.
     * Thinking генерируется на основе анализа запроса.
     */
    private Flux<StreamingChatChunk> thinkingFlux(List<String> thinkingChunks) {
        return Flux.fromIterable(thinkingChunks)
                .delayElements(java.time.Duration.ofMillis(40))
                .map(chunk -> new StreamingChatChunk(
                        StreamingChatChunk.Type.THINKING, chunk, null, false, false, 0, 0, null, null));
    }

    private Flux<StreamingChatChunk> handlePlainStreaming(Long conversationId, String userMessage, String traceId) {
        log.info("[chat-service] handlePlainStreaming conversationId={}", conversationId);

        // Генерируем thinking-текст (анализ запроса)
        String thinkingText = generateThinkingText(userMessage, false);
        List<String> thinkingChunks = splitIntoWords(thinkingText);

        // Стримим thinking чанки с задержкой (imitate LLM thinking speed)
        Flux<StreamingChatChunk> stream = thinkingFlux(thinkingChunks);

        // Получаем ответ (синхронно, т.к. LLM response без thinking split)
        return stream.concatWith(Flux.defer(() -> {
            String answer = callLlmWithHistory(conversationId, null);
            String fullThinking = String.join(" ", thinkingChunks);
            log.info("[chat-service] handlePlainStreaming:done traceId={}", traceId);
            return Flux.just(new StreamingChatChunk(
                    StreamingChatChunk.Type.DONE, fullThinking, answer,
                    false, false, 0, 0, null, null));
        }))
        .doOnComplete(() -> saveMessage(conversationId, MessageRole.ASSISTANT,
                thinkingChunks.isEmpty() ? "" : String.join(" ", thinkingChunks)));
    }

    /**
     * RAG streaming: эмбеддинг + поиск → thinking → LLM ответ.
     */
    private Flux<StreamingChatChunk> handleRagStreaming(Long conversationId, String userMessage, String traceId) {
        log.info("[chat-service] handleRagStreaming:start traceId={}", traceId);

        // Фаза 1: эмбеддинг и поиск (fast)
        return Flux.defer(() -> {
            RagContextResultDto contextResult = ragService.retrieveContext(userMessage, ragTopK, traceId);
            int chunksFound = contextResult.getFoundChunks();
            int usedChunks = contextResult.getUsedChunks();
            Double bestScore = contextResult.getBestScore();
            double threshold = contextResult.getThreshold();
            boolean fallbackWithoutContext = (usedChunks == 0);

            log.info("[chat-service] handleRagStreaming:retrieved traceId={}, chunksFound={}, usedChunks={}",
                    traceId, chunksFound, usedChunks);

            if (fallbackWithoutContext) {
                String noDataMessage = "Данные в базе знаний не найдены по вашему запросу. Уточните вопрос или добавьте релевантные материалы.";
                saveMessage(conversationId, MessageRole.ASSISTANT, noDataMessage);
                return Flux.just(
                                new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "embedding", "done", null),
                                new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "search", "done", null),
                                new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "generation", "done", null),
                                new StreamingChatChunk(StreamingChatChunk.Type.RAG_SEARCH, null, null, true, false, chunksFound, usedChunks, bestScore, threshold, null, null, chunksFound),
                                new StreamingChatChunk(StreamingChatChunk.Type.DONE, "", noDataMessage,
                                        true, false, chunksFound, usedChunks, bestScore, threshold))
                        .doOnComplete(() -> {
                            // already saved above
                        });
            }

            // Строим thinking на основе результатов поиска
            String contextPrompt = ragService.buildContextPrompt(contextResult.getChunks(), traceId);
            String thinkingText = generateRagThinkingText(userMessage, contextResult);
            List<String> thinkingChunks = splitIntoWords(thinkingText);

            // Стримим thinking
            Flux<StreamingChatChunk> stream = thinkingFlux(thinkingChunks);

            // Получаем ответ с контекстом
            List<String> contextChunks = (contextPrompt == null || contextPrompt.isBlank())
                    ? List.of()
                    : List.of(contextPrompt);

            return Flux.just(
                            new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "embedding", "done", null),
                            new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "search", "done", null),
                            new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "generation", "start", null),
                            new StreamingChatChunk(StreamingChatChunk.Type.RAG_SEARCH, null, null, true, chunksFound == 0 || usedChunks > 0, chunksFound, usedChunks, bestScore, threshold, null, null, chunksFound)
                    )
                    .concatWith(stream)
                    .concatWith(Flux.defer(() -> {
                        String answer = callLlmWithHistory(conversationId, contextChunks);
                        String fullThinking = String.join(" ", thinkingChunks);
                        log.info("[chat-service] handleRagStreaming:done traceId={}", traceId);
                        return Flux.just(
                                new StreamingChatChunk(StreamingChatChunk.Type.RAG_STEP, null, null, false, false, 0, 0, null, null, "generation", "done", null),
                                new StreamingChatChunk(
                                        StreamingChatChunk.Type.DONE, fullThinking, answer,
                                        true, true, chunksFound, usedChunks, bestScore, threshold))
                                .doOnComplete(() -> saveMessage(conversationId, MessageRole.ASSISTANT, answer));
                    }));
        });
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
                "1. Эмбеддинг запроса (dim=1536) готов.\n" +
                "2. Поиск по БД: top-5, порог → " + contextResult.getFoundChunks() + " чанка.\n" +
                "3. Источники: проанализировано " + contextResult.getUsedChunks() + " чанков.\n" +
                "4. Формирую ответ из контекста.";
    }

    /**
     * Разбивает текст на слова для построчного стриминга.
     */
    private List<String> splitIntoWords(String text) {
        // Разбиваем по пробелам, сохраняя переносы строк как отдельные "слова"
        return List.of(text.split("(?<=\\s)|(?=\\s)"));
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }

    private void saveMessage(Long conversationId, MessageRole role, String content) {
        Message message = new Message();
        message.setConversation(new Conversation() {{ setId(conversationId); }});
        message.setRole(role);
        message.setContent(content);
        message.setCreatedAt(Instant.now());
        messageRepository.save(message);
        log.debug("[chat-service] message saved conversationId={}, role={}", conversationId, role);
    }

    @Override
    public MessageResponseDto handlePlain(Long conversationId, String userMessage) {
        log.info("[chat-service] handlePlain conversationId={}, userMessageLength={}",
                conversationId, userMessage == null ? 0 : userMessage.length());
        String answer = callLlmWithHistory(conversationId, null);
        return new MessageResponseDto(answer, conversationId, false, false, 0, 0, null, null);
    }

    @Override
    public MessageResponseDto handleRag(Long conversationId, String userMessage) {
        return handleRag(conversationId, userMessage, UUID.randomUUID().toString());
    }

    private MessageResponseDto handleRag(Long conversationId, String userMessage, String traceId) {
        int requestLength = userMessage == null ? 0 : userMessage.length();
        log.info("[chat-service] handleRag:start traceId={}, conversationId={}, userMessageLength={}, topK={}",
                traceId, conversationId, requestLength, ragTopK);

        RagContextResultDto contextResult = ragService.retrieveContext(userMessage, ragTopK, traceId);
        int chunksFound = contextResult.getFoundChunks();
        int usedChunks = contextResult.getUsedChunks();
        Double bestScore = contextResult.getBestScore();
        double threshold = contextResult.getThreshold();
        boolean fallbackWithoutContext = (usedChunks == 0);

        log.info("[chat-service] handleRag:retrieved traceId={}, conversationId={}, chunksFound={}, usedChunks={}, bestScore={}, threshold={}, fallbackWithoutContext={}",
                traceId, conversationId, chunksFound, usedChunks, bestScore, threshold, fallbackWithoutContext);

        if (fallbackWithoutContext) {
            String noDataMessage = "Данные в базе знаний не найдены по вашему запросу. Уточните вопрос или добавьте релевантные материалы.";
            return new MessageResponseDto(noDataMessage, conversationId, true, false, chunksFound, usedChunks, bestScore, threshold);
        }

        String contextPrompt = ragService.buildContextPrompt(contextResult.getChunks(), traceId);
        List<String> contextChunks = (contextPrompt == null || contextPrompt.isBlank())
                ? List.of()
                : List.of(contextPrompt);

        String llmAnswer = callLlmWithHistory(conversationId, contextChunks);
        return new MessageResponseDto(llmAnswer, conversationId, true, true, chunksFound, usedChunks, bestScore, threshold);
    }

    private String callLlmWithHistory(Long conversationId, List<String> contextChunks) {
        List<Message> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);

        // FIFO-обрезка: если сообщений больше порога — оставляем последнюю половину
        List<ChatMessageDto> messages;
        if (history.size() > maxHistoryMessages) {
            int keep = maxHistoryMessages / 2;
            messages = history.subList(history.size() - keep, history.size()).stream()
                    .map(m -> new ChatMessageDto(m.getRole().name().toLowerCase(), m.getContent()))
                    .toList();
            log.info("[chat-service] history:trimmed conversationId={}, total={}, kept={}", conversationId, history.size(), keep);
        } else {
            messages = history.stream()
                    .map(m -> new ChatMessageDto(m.getRole().name().toLowerCase(), m.getContent()))
                    .toList();
        }

        ChatRequestDto request = new ChatRequestDto();
        request.setMessages(messages);
        request.setContextChunks(contextChunks);

        ChatResponseDto response = pythonServiceClient.chat(request);
        return response != null && response.getContent() != null ? response.getContent() : "";
    }

    @Override
    public ConversationResponseDto getConversation(Long id) {
        Conversation conversation = conversationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Conversation not found: " + id));
        return new ConversationResponseDto(conversation.getId(), conversation.getUser().getId(), conversation.getMode().name(),
                conversation.getTitle(), conversation.getCreatedAt());
    }

    @Override
    public List<ConversationResponseDto> listConversations(Long userId) {
        return conversationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(c -> new ConversationResponseDto(c.getId(), c.getUser().getId(), c.getMode().name(), c.getTitle(), c.getCreatedAt()))
                .toList();
    }

    @Override
    public List<MessageDto> getHistory(Long conversationId) {
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                .map(m -> new MessageDto(m.getId(), m.getRole().name(), m.getContent(), m.getCreatedAt()))
                .toList();
    }
}
