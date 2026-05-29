package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.dto.ChatMessageDto;
import com.example.ragchatbot.dto.ChatRequestDto;
import com.example.ragchatbot.dto.ChatResponseDto;
import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.service.ChatService;
import com.example.ragchatbot.dto.ConversationMode;
import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.entity.KnowledgeChunk;
import com.example.ragchatbot.service.RagService;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private final PythonServiceClient pythonServiceClient;
    private final RagService ragService;

    @Value("${chat.rag.top-k:5}")
    private int ragTopK;

    private final AtomicLong conversationSeq = new AtomicLong(1);
    @Override
    public Long createConversation(Long userId, String title, String mode) {
        long conversationId = conversationSeq.getAndIncrement();
        log.info("[chat-service] createConversation created conversationId={}, userId={}, mode={}, title={}",
                conversationId, userId, mode, title);
        return conversationId;
    }

    @Override
    public MessageResponseDto sendMessage(Long conversationId, MessageRequestDto request) {
        String traceId = UUID.randomUUID().toString();
        log.info("[chat-service] sendMessage:start traceId={}, conversationId={}, mode={}, contentLength={}",
                traceId,
                conversationId,
                request.getMode(),
                request.getContent() == null ? 0 : request.getContent().length());
        ConversationMode requestedMode = request.getMode();

        if (requestedMode == ConversationMode.RAG) {
            log.info("[chat-service] sendMessage:route=RAG traceId={}, conversationId={}", traceId, conversationId);
            return handleRag(conversationId, request.getContent(), traceId);
        }
        log.info("[chat-service] sendMessage:route=PLAIN traceId={}, conversationId={}", traceId, conversationId);
        return handlePlain(conversationId, request.getContent());
    }

    @Override
    public MessageResponseDto handlePlain(Long conversationId, String userMessage) {
        log.info("[chat-service] handlePlain conversationId={}, userMessageLength={}",
                conversationId, userMessage == null ? 0 : userMessage.length());
        MessageResponseDto response = new MessageResponseDto(callLlm(userMessage, null), conversationId, false, false, 0, 0, null, null);
        log.info("[chat-service] handlePlain:done conversationId={}, responseLength={}",
                conversationId, response.getContent().length());
        return response;
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
        List<KnowledgeChunk> chunks = contextResult.getChunks();
        int chunksFound = contextResult.getFoundChunks();
        int usedChunks = contextResult.getUsedChunks();
        Double bestScore = contextResult.getBestScore();
        double threshold = contextResult.getThreshold();
        boolean fallbackWithoutContext = (usedChunks == 0);

        log.info("[chat-service] handleRag:retrieved traceId={}, conversationId={}, chunksFound={}, usedChunks={}, bestScore={}, threshold={}, fallbackWithoutContext={}",
                traceId, conversationId, chunksFound, usedChunks, bestScore, threshold, fallbackWithoutContext);

        if (fallbackWithoutContext) {
            String noDataMessage = "Данные в базе знаний не найдены по вашему запросу. Уточните вопрос или добавьте релевантные материалы.";
            MessageResponseDto response = new MessageResponseDto(noDataMessage, conversationId, true, false, chunksFound, usedChunks, bestScore, threshold);
            log.info("[chat-service] handleRag:done-without-llm traceId={}, conversationId={}, responseLength={}",
                    traceId, conversationId, response.getContent().length());
            return response;
        }

        String contextPrompt = ragService.buildContextPrompt(chunks, traceId);
        List<String> contextChunks = (contextPrompt == null || contextPrompt.isBlank())
                ? List.of()
                : List.of(contextPrompt);

        String llmAnswer = callLlm(userMessage, contextChunks);
        MessageResponseDto response = new MessageResponseDto(llmAnswer, conversationId, true, true, chunksFound, usedChunks, bestScore, threshold);
        log.info("[chat-service] handleRag:done traceId={}, conversationId={}, responseLength={}",
                traceId, conversationId, response.getContent().length());
        return response;
    }

    private String callLlm(String userMessage, List<String> contextChunks) {
        ChatMessageDto message = new ChatMessageDto();
        message.setRole("user");
        message.setContent(userMessage == null ? "" : userMessage);

        ChatRequestDto request = new ChatRequestDto();
        request.setMessages(List.of(message));
        request.setContextChunks(contextChunks);

        ChatResponseDto response = pythonServiceClient.chat(request);
        return response != null && response.getContent() != null ? response.getContent() : "";
    }

}
