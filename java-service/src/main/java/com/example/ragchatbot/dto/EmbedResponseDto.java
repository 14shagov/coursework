package com.example.ragchatbot.dto;

import java.util.List;
import lombok.Data;

@Data
public class EmbedResponseDto {
    private List<Float> embedding;
}
