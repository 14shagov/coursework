package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;

import java.util.List;

public interface ChatService {
    ConversationResponseDto createConversation(Long userId, String title, String mode);

    MessageResponseDto sendMessage(Long conversationId, MessageRequestDto request);

    MessageResponseDto handlePlain(Long conversationId, String userMessage);

    MessageResponseDto handleRag(Long conversationId, String userMessage);

    ConversationResponseDto getConversation(Long id);

    List<com.example.ragchatbot.dto.MessageDto> getHistory(Long conversationId);
}
