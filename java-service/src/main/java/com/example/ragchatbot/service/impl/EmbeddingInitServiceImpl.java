package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.dto.EmbedRequestDto;
import com.example.ragchatbot.dto.EmbedResponseDto;
import com.example.ragchatbot.entity.KnowledgeChunk;
import com.example.ragchatbot.repository.KnowledgeChunkRepository;
import com.example.ragchatbot.service.EmbeddingInitService;
import com.example.ragchatbot.util.VectorSqlFormatter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class EmbeddingInitServiceImpl implements EmbeddingInitService {

    private final KnowledgeChunkRepository knowledgeChunkRepository;
    private final PythonServiceClient pythonServiceClient;

    @Override
    @Transactional
    public void initMissingEmbeddings() {
        List<KnowledgeChunk> chunksWithoutEmbeddings = knowledgeChunkRepository.findByEmbeddingIsNull();
        log.info("[embedding-init] start, missing_chunks={}", chunksWithoutEmbeddings.size());

        int processed = 0;
        int skipped = 0;

        for (KnowledgeChunk chunk : chunksWithoutEmbeddings) {
            String content = chunk.getContent();
            if (content == null || content.isBlank()) {
                skipped++;
                log.warn("[embedding-init] skip chunkId={} due to blank content", chunk.getId());
                continue;
            }

            EmbedRequestDto request = new EmbedRequestDto();
            request.setText(content);

            EmbedResponseDto response = pythonServiceClient.embed(request);
            String embedding = VectorSqlFormatter.toVectorLiteral(response.getEmbedding());
            if (embedding == null || embedding.isBlank()) {
                skipped++;
                log.warn("[embedding-init] skip chunkId={} due to empty embedding", chunk.getId());
                continue;
            }

            int updated = knowledgeChunkRepository.updateEmbeddingByChunkId(chunk.getId(), embedding);
            if (updated > 0) {
                processed++;
            } else {
                skipped++;
                log.warn("[embedding-init] skip chunkId={} due to failed update", chunk.getId());
            }
        }

        log.info("[embedding-init] done, processed={}, skipped={}", processed, skipped);
    }

}
