package com.example.ragchatbot.dto;

import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class StreamingChatChunk {
    public enum Type {
        THINKING("thinking"),
        CONTENT("content"),
        ERROR("error"),
        DONE("done"),
        RAG_STEP("rag_step"),
        RAG_SEARCH("rag_search");

        private final String value;

        Type(String value) {
            this.value = value;
        }

        @JsonValue
        public String getValue() {
            return value;
        }
    }

    private Type type;
    private String thinking;
    private String content;
    private String error;
    /** Streaming reasoning/thought text from LLM (separate from thinking). */
    private String reasoning;
    private boolean usedRag;
    private boolean usedContext;
    private int retrievedChunksCount;
    private int usedChunks;
    private int foundChunks;
    private Double bestScore;
    private Double threshold;
    private String step;
    private String status;

    public StreamingChatChunk(Type type, String thinking, String content, String reasoning,
                              boolean usedRag, boolean usedContext, int retrievedChunksCount,
                              int usedChunks, int foundChunks, Double bestScore, Double threshold,
                              String step, String status) {
        this.type = type;
        this.thinking = thinking;
        this.content = content;
        this.reasoning = reasoning;
        this.usedRag = usedRag;
        this.usedContext = usedContext;
        this.retrievedChunksCount = retrievedChunksCount;
        this.usedChunks = usedChunks;
        this.foundChunks = foundChunks;
        this.bestScore = bestScore;
        this.threshold = threshold;
        this.step = step;
        this.status = status;
    }

    public static StreamingChatChunk error(String message) {
        StreamingChatChunk chunk = new StreamingChatChunk();
        chunk.setType(Type.ERROR);
        chunk.setError(message);
        return chunk;
    }
}
