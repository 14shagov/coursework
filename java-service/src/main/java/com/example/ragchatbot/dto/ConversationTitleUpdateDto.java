package com.example.ragchatbot.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ConversationTitleUpdateDto {
    @NotBlank
    @Size(max = 255)
    private String title;
}
