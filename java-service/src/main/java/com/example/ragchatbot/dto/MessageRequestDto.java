package com.example.ragchatbot.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Data
public class MessageRequestDto {
    @NotBlank
    @Size(max = 20_000)
    private String content;
}
