package com.example.ragchatbot.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MessageResponseDto {
    private String content;
    private Long conversationId;
    private boolean usedRag;
    private boolean usedContext;
    private int retrievedChunksCount;
    private int usedChunks;
    private Double bestScore;
    private Double threshold;
}
