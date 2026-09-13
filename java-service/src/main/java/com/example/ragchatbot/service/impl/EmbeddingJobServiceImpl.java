package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.dto.EmbeddingJobResponseDto;
import com.example.ragchatbot.entity.EmbeddingJob;
import com.example.ragchatbot.entity.EmbeddingJobStatus;
import com.example.ragchatbot.repository.EmbeddingJobRepository;
import com.example.ragchatbot.repository.UserRepository;
import com.example.ragchatbot.service.EmbeddingJobService;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class EmbeddingJobServiceImpl implements EmbeddingJobService {

    private final EmbeddingJobRepository embeddingJobRepository;
    private final UserRepository userRepository;
    private final EmbeddingJobWorker embeddingJobWorker;

    @Override
    public EmbeddingJobResponseDto startJob(long requestedByUserId) {
        if (!userRepository.existsById(requestedByUserId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User is not available");
        }

        EmbeddingJob job = new EmbeddingJob();
        job.setRequestedByUserId(requestedByUserId);
        job.setStatus(EmbeddingJobStatus.QUEUED);
        job.setCreatedAt(Instant.now());

        try {
            EmbeddingJob saved = embeddingJobRepository.saveAndFlush(job);
            embeddingJobWorker.run(saved.getId());
            return toDto(saved);
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An embedding job is already running");
        }
    }

    @Override
    public EmbeddingJobResponseDto getJob(long jobId) {
        return toDto(requireJob(jobId));
    }

    public void failInterruptedJobs() {
        embeddingJobRepository.failInterruptedActiveJobs(
                "Job interrupted because the service restarted", Instant.now(), EmbeddingJobStatus.FAILED,
                List.of(EmbeddingJobStatus.QUEUED, EmbeddingJobStatus.RUNNING));
    }

    private EmbeddingJob requireJob(long jobId) {
        return embeddingJobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Embedding job not found"));
    }

    private EmbeddingJobResponseDto toDto(EmbeddingJob job) {
        return new EmbeddingJobResponseDto(job.getId(), job.getStatus(), job.getTotalChunks(),
                job.getProcessedChunks(), job.getSkippedChunks(), job.getFailedChunks(), job.getRequestedByUserId(),
                job.getErrorMessage(), job.getCreatedAt(), job.getStartedAt(), job.getCompletedAt());
    }
}
