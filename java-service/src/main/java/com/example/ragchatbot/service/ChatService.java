package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.dto.StreamingChatChunk;

import java.util.List;
import reactor.core.publisher.Flux;

public interface ChatService {
    ConversationResponseDto createConversation(Long userId, String title, com.example.ragchatbot.dto.ConversationMode mode,
                                               String llmModel);

    ConversationResponseDto updateConversationModel(Long userId, Long conversationId, String llmModel);

    List<com.example.ragchatbot.dto.ChatModelDto> getChatModels();

    MessageResponseDto sendMessage(Long userId, Long conversationId, String content);

    Flux<StreamingChatChunk> sendMessageStreaming(Long userId, Long conversationId, String content);

    ConversationResponseDto getConversation(Long userId, Long id);

    List<ConversationResponseDto> listConversations(Long userId);

    List<com.example.ragchatbot.dto.MessageDto> getHistory(Long userId, Long conversationId);
}
