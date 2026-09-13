package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.EmbeddingJobResponseDto;

public interface EmbeddingJobService {
    EmbeddingJobResponseDto startJob(long requestedByUserId);

    EmbeddingJobResponseDto getJob(long jobId);
}
