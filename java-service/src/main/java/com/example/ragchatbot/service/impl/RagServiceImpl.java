package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.dto.EmbedRequestDto;
import com.example.ragchatbot.dto.EmbedResponseDto;
import com.example.ragchatbot.dto.RagChunkMatchDto;
import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.entity.KnowledgeChunk;
import com.example.ragchatbot.repository.KnowledgeChunkRepository;
import com.example.ragchatbot.service.RagService;
import com.example.ragchatbot.util.VectorSqlFormatter;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
@RequiredArgsConstructor
public class RagServiceImpl implements RagService {

    private final PythonServiceClient pythonServiceClient;
    private final KnowledgeChunkRepository knowledgeChunkRepository;

    /**
     * Минимальный порог cosine similarity для включения чанка в контекст.
     * Диапазон: 0.0–1.0, где 1.0 — идентичные векторы.
     * 0.0 означает "без фильтрации" (брать все топ-K результатов).
     * Рекомендуемое значение для старта: 0.5–0.6
     */
    @Value("${chat.rag.min-similarity:0.0}")
    private double minSimilarity;

    @Override
    public RagContextResultDto retrieveContext(String userMessage, int topK, String traceId) {
        if (userMessage == null || userMessage.isBlank() || topK <= 0) {
            log.info("[rag-service] retrieve:skip traceId={}, reason=invalid-input, topK={}, userMessageLength={}",
                    traceId, topK, userMessage == null ? 0 : userMessage.length());
            return new RagContextResultDto(List.of(), 0, 0, null, minSimilarity);
        }

        String normalizedMessage = normalizeUserMessage(userMessage);

        EmbedRequestDto embedRequest = new EmbedRequestDto();
        embedRequest.setText(normalizedMessage);
        EmbedResponseDto embedResponse = pythonServiceClient.embed(embedRequest);

        if (embedResponse == null || embedResponse.getEmbedding() == null || embedResponse.getEmbedding().isEmpty()) {
            log.info("[rag-service] retrieve:skip traceId={}, reason=empty-embedding", traceId);
            return new RagContextResultDto(List.of(), 0, 0, null, minSimilarity);
        }

        log.debug("[rag-service] retrieve:embedding traceId={}, queryVectorLength={}",
                traceId, embedResponse.getEmbedding().size());

        String embeddingLiteral = VectorSqlFormatter.toVectorLiteral(embedResponse.getEmbedding());
        List<KnowledgeChunkRepository.ChunkSimilarityProjection> raw =
                knowledgeChunkRepository.findTopKBySimilarity(embeddingLiteral, topK);

        List<RagChunkMatchDto> matches =  raw.stream()
                .map(this::toMatch)
                .toList();

        matches.forEach(m -> log.info(
                "[rag-service] chunk traceId={}, chunkId={}, similarity={}",
                traceId, m.getChunk().getId(), m.getScore()
        ));

        int foundChunks = matches.size();

        List<RagChunkMatchDto> filtered = matches.stream()
                .filter(this::passesThreshold)
                .toList();

        Double bestScore = matches.stream()
                .map(RagChunkMatchDto::getScore)
                .max(Double::compareTo)
                .orElse(null);

        List<KnowledgeChunk> chunks = filtered.stream()
                .map(RagChunkMatchDto::getChunk)
                .toList();

        log.info("[rag-service] retrieve:done traceId={}, found={}, afterFilter={}, bestScore={}, rawQueryLength={}, normalizedQueryLength={}",
                traceId, foundChunks, chunks.size(), bestScore,
                userMessage.length(), normalizedMessage.length());

        return new RagContextResultDto(chunks, foundChunks, chunks.size(), bestScore, minSimilarity);
    }

    private String normalizeUserMessage(String userMessage) {
        return userMessage.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private RagChunkMatchDto toMatch(KnowledgeChunkRepository.ChunkSimilarityProjection row) {
        KnowledgeChunk chunk = new KnowledgeChunk();
        chunk.setId(row.getId());
        chunk.setChunkIndex(row.getChunkIndex());
        chunk.setContent(row.getContent());
        chunk.setCreatedAt(row.getCreatedAt() != null ? row.getCreatedAt() : Instant.now());

        // score из БД — cosine distance (0 = идентично, 2 = противоположно)
        // конвертируем в similarity (0..1, где 1 = идентично)
        double similarity = row.getScore() != null ? 1.0 - row.getScore() : 0.0;
        return new RagChunkMatchDto(chunk, similarity);
    }

    private boolean passesThreshold(RagChunkMatchDto match) {
        // minSimilarity <= 0 означает "без фильтрации"
        return minSimilarity <= 0 || match.getScore() >= minSimilarity;
    }

    @Override
    public String buildContextPrompt(List<KnowledgeChunk> chunks, String traceId) {
        if (chunks == null || chunks.isEmpty()) {
            log.info("[rag-service] buildContextPrompt:done traceId={}, includedChunks=0, contextLength=0", traceId);
            return "";
        }

        StringBuilder context = new StringBuilder("Контекст для ответа:\n");
        int position = 1;
        for (KnowledgeChunk chunk : chunks) {
            String chunkContent = chunk != null && chunk.getContent() != null
                    ? chunk.getContent().trim()
                    : "";
            if (chunkContent.isEmpty()) {
                continue;
            }
            context.append(position)
                    .append(") chunk=")
                    .append(chunk.getChunkIndex() != null ? chunk.getChunkIndex() : "?")
                    .append('\n')
                    .append(chunkContent)
                    .append("\n\n");
            position++;
        }

        String result = context.toString().trim();
        log.info("[rag-service] buildContextPrompt:done traceId={}, includedChunks={}, contextLength={}",
                traceId, position - 1, result.length());
        return result;
    }

}
