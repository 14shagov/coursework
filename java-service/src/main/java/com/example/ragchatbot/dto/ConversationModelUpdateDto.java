package com.example.ragchatbot.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ConversationModelUpdateDto {
    @NotBlank
    private String llmModel;
}
