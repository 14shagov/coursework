package com.example.ragchatbot.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class TitleRequestDto {
    @NotBlank
    @Size(max = 20_000)
    private String content;
}
