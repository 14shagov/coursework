package com.example.ragchatbot.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Data
public class ConversationCreateDto {
    @NotNull
    private ConversationMode mode;

    @NotBlank
    @Size(max = 255)
    private String title;
}
