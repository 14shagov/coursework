package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.dto.EmbedRequestDto;
import com.example.ragchatbot.dto.EmbedResponseDto;
import com.example.ragchatbot.entity.EmbeddingJob;
import com.example.ragchatbot.entity.EmbeddingJobStatus;
import com.example.ragchatbot.entity.KnowledgeChunk;
import com.example.ragchatbot.repository.EmbeddingJobRepository;
import com.example.ragchatbot.repository.KnowledgeChunkRepository;
import com.example.ragchatbot.util.EmbeddingVectorContract;
import com.example.ragchatbot.util.VectorSqlFormatter;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class EmbeddingJobWorker {

    private final EmbeddingJobRepository embeddingJobRepository;
    private final KnowledgeChunkRepository knowledgeChunkRepository;
    private final PythonServiceClient pythonServiceClient;

    @Async("embeddingJobExecutor")
    public void run(long jobId) {
        try {
            updateJob(jobId, job -> {
                job.setStatus(EmbeddingJobStatus.RUNNING);
                job.setStartedAt(Instant.now());
            });

            List<KnowledgeChunk> chunks = knowledgeChunkRepository.findByEmbeddingIsNull();
            updateJob(jobId, job -> job.setTotalChunks(chunks.size()));
            log.info("[embedding-job] start jobId={}, missingChunks={}", jobId, chunks.size());

            for (KnowledgeChunk chunk : chunks) {
                processChunk(jobId, chunk);
            }

            updateJob(jobId, job -> {
                job.setStatus(EmbeddingJobStatus.COMPLETED);
                job.setCompletedAt(Instant.now());
            });
            log.info("[embedding-job] completed jobId={}", jobId);
        } catch (Exception exception) {
            log.error("[embedding-job] fatal failure jobId={}, type={}", jobId, exception.getClass().getSimpleName());
            updateJob(jobId, job -> {
                job.setStatus(EmbeddingJobStatus.FAILED);
                job.setErrorMessage("Embedding job failed due to an infrastructure error");
                job.setCompletedAt(Instant.now());
            });
        }
    }

    private void processChunk(long jobId, KnowledgeChunk chunk) {
        if (chunk.getContent() == null || chunk.getContent().isBlank()) {
            incrementSkipped(jobId);
            log.warn("[embedding-job] skip jobId={}, chunkId={}, reason=blank-content", jobId, chunk.getId());
            return;
        }

        try {
            EmbedRequestDto request = new EmbedRequestDto();
            request.setText(chunk.getContent());
            EmbedResponseDto response = pythonServiceClient.embed(request);
            String embedding = VectorSqlFormatter.toVectorLiteral(
                    response == null ? null : response.getEmbedding(), EmbeddingVectorContract.DIMENSIONS);

            if (knowledgeChunkRepository.updateEmbeddingByChunkId(chunk.getId(), embedding) == 1) {
                incrementProcessed(jobId);
            } else {
                incrementSkipped(jobId);
                log.warn("[embedding-job] skip jobId={}, chunkId={}, reason=not-updated", jobId, chunk.getId());
            }
        } catch (Exception exception) {
            incrementFailed(jobId);
            log.warn("[embedding-job] failed jobId={}, chunkId={}, type={}", jobId, chunk.getId(),
                    exception.getClass().getSimpleName());
        }
    }

    private void incrementProcessed(long jobId) {
        updateJob(jobId, job -> job.setProcessedChunks(job.getProcessedChunks() + 1));
    }

    private void incrementSkipped(long jobId) {
        updateJob(jobId, job -> job.setSkippedChunks(job.getSkippedChunks() + 1));
    }

    private void incrementFailed(long jobId) {
        updateJob(jobId, job -> job.setFailedChunks(job.getFailedChunks() + 1));
    }

    private void updateJob(long jobId, java.util.function.Consumer<EmbeddingJob> update) {
        embeddingJobRepository.findById(jobId).ifPresent(job -> {
            update.accept(job);
            embeddingJobRepository.save(job);
        });
    }
}
