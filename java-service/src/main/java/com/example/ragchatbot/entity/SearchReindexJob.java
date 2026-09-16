package com.example.ragchatbot.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Data;

@Data
@Entity
@Table(name = "search_reindex_jobs")
public class SearchReindexJob {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long requestedByUserId;
    @Enumerated(EnumType.STRING)
    private SearchOutboxStatus status;
    private int totalDocuments;
    private int processedDocuments;
    private int failedDocuments;
    private String errorMessage;
    private Instant createdAt;
    private Instant startedAt;
    private Instant completedAt;
}
