package com.example.ragchatbot.dto;

import com.example.ragchatbot.entity.SearchOutboxStatus;
import java.time.Instant;

public record SearchReindexJobResponseDto(
        Long id,
        SearchOutboxStatus status,
        int totalDocuments,
        int processedDocuments,
        int failedDocuments,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant completedAt
) {
}
