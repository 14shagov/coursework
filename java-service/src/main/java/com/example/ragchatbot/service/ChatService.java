package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;

import java.util.List;
import reactor.core.publisher.Flux;

public interface ChatService {
    ConversationResponseDto createConversation(Long userId, String title, String mode);

    MessageResponseDto sendMessage(Long conversationId, MessageRequestDto request);

    Flux<StreamingChatChunk> sendMessageStreaming(Long conversationId, MessageRequestDto request);

    MessageResponseDto handlePlain(Long conversationId, String userMessage);

    MessageResponseDto handleRag(Long conversationId, String userMessage);

    ConversationResponseDto getConversation(Long id);

    List<ConversationResponseDto> listConversations(Long userId);

    List<com.example.ragchatbot.dto.MessageDto> getHistory(Long conversationId);
}
