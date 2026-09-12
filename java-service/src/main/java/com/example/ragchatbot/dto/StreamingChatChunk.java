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

    // Type = THINKING: partial thinking text (appended)
    private String thinking;

    // Type = DONE: final response content
    private String content;

    // RAG metadata (set on DONE)
    private boolean usedRag;
    private boolean usedContext;
    private int retrievedChunksCount;
    private int usedChunks;
    private Double bestScore;
    private Double threshold;
}
