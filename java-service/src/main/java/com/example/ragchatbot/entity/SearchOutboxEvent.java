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
@Table(name = "search_outbox")
public class SearchOutboxEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Enumerated(EnumType.STRING)
    private SearchOutboxEventType eventType;
    private Long aggregateId;
    @Enumerated(EnumType.STRING)
    private SearchOutboxStatus status;
    private int attempts;
    private String errorMessage;
    private Instant createdAt;
    private Instant processedAt;
}
