package com.example.ragchatbot.service;

import com.example.ragchatbot.service.impl.EmbeddingJobServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EmbeddingJobRecoveryService {

    private final EmbeddingJobServiceImpl embeddingJobService;

    @EventListener(ApplicationReadyEvent.class)
    public void markInterruptedJobsAsFailed() {
        embeddingJobService.failInterruptedJobs();
    }
}
