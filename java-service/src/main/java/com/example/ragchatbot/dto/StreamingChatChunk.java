package com.example.ragchatbot.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StreamingChatChunk {
    public enum Type { THINKING, DONE }

    private Type type;
    private String thinking;
    private String content;
    private boolean usedRag;
    private boolean usedContext;
    private int retrievedChunksCount;
    private int usedChunks;
    private Double bestScore;
    private Double threshold;
}
