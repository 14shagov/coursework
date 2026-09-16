package com.example.ragchatbot.dto;

import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ConversationResponseDto {
    private Long id;
    private Long userId;
    private String mode;
    private String title;
    private Instant createdAt;
    private String llmModel;
    private String titleOrigin;
    private String titleGenerationStatus;
    private Instant lastMessageAt;

    public ConversationResponseDto(Long id, Long userId, String mode, String title, Instant createdAt, String llmModel) {
        this(id, userId, mode, title, createdAt, llmModel, null, null, null);
    }

    public ConversationResponseDto(Long id, Long userId, String mode, String title, Instant createdAt, String llmModel,
                                   String titleOrigin, String titleGenerationStatus, Instant lastMessageAt) {
        this.id = id;
        this.userId = userId;
        this.mode = mode;
        this.title = title;
        this.createdAt = createdAt;
        this.llmModel = llmModel;
        this.titleOrigin = titleOrigin;
        this.titleGenerationStatus = titleGenerationStatus;
        this.lastMessageAt = lastMessageAt;
    }
}
