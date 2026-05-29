package com.example.ragchatbot.dto;

import lombok.Data;

@Data
public class MessageRequestDto {
    private String content;
    private ConversationMode mode;
}
