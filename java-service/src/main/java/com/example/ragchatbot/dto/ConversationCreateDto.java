package com.example.ragchatbot.dto;

import lombok.Data;

@Data
public class ConversationCreateDto {
    private Long userId;
    private ConversationMode mode;
    private String title;
}
