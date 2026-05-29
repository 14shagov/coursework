package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;

public interface ChatService {
    Long createConversation(Long userId, String title, String mode);

    MessageResponseDto sendMessage(Long conversationId, MessageRequestDto request);

    MessageResponseDto handlePlain(Long conversationId, String userMessage);

    MessageResponseDto handleRag(Long conversationId, String userMessage);
}
