package com.example.ragchatbot.dto;

import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StreamingChatChunk {
    public enum Type {
        THINKING("thinking"),
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
    private boolean usedRag;
    private boolean usedContext;
    private int retrievedChunksCount;
    private int usedChunks;
    private Double bestScore;
    private Double threshold;
    private String step;
    private String status;
    private Integer foundChunks;
}
