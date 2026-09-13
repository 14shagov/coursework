package com.example.ragchatbot.dto;

import com.example.ragchatbot.entity.EmbeddingJobStatus;
import java.time.Instant;

public record EmbeddingJobResponseDto(
        Long id,
        EmbeddingJobStatus status,
        int totalChunks,
        int processedChunks,
        int skippedChunks,
        int failedChunks,
        Long requestedByUserId,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant completedAt
) {
}
