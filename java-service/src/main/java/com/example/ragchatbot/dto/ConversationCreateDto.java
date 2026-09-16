package com.example.ragchatbot.dto;

import lombok.Data;
import jakarta.validation.constraints.NotNull;

@Data
public class ConversationCreateDto {
    @NotNull
    private ConversationMode mode;

    private String title;

    private String llmModel;
}
