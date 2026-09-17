package com.example.ragchatbot.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.dto.EmbedResponseDto;
import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.repository.KnowledgeChunkRepository;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class RagServiceImplTest {

    private final PythonServiceClient pythonServiceClient = mock(PythonServiceClient.class);
    private final KnowledgeChunkRepository knowledgeChunkRepository = mock(KnowledgeChunkRepository.class);
    private final RagServiceImpl service = new RagServiceImpl(pythonServiceClient, knowledgeChunkRepository);

    RagServiceImplTest() {
        ReflectionTestUtils.setField(service, "minSimilarity", 0.0d);
    }

    @Test
    void rejectsEmptyQueryEmbedding() {
        EmbedResponseDto response = new EmbedResponseDto();
        response.setEmbedding(Collections.emptyList());
        when(pythonServiceClient.embed(org.mockito.ArgumentMatchers.any())).thenReturn(response);

        assertThrows(ResponseStatusException.class,
                () -> service.retrieveContext("question", 5, "trace"));
    }

    @Test
    void rejectsWrongSizeQueryEmbedding() {
        EmbedResponseDto response = new EmbedResponseDto();
        response.setEmbedding(java.util.List.of(1.0f));
        when(pythonServiceClient.embed(org.mockito.ArgumentMatchers.any())).thenReturn(response);

        assertThrows(ResponseStatusException.class,
                () -> service.retrieveContext("question", 5, "trace"));
    }

    @Test
    void keepsOnlyCandidatesThatMeetConfiguredSimilarityThreshold() {
        ReflectionTestUtils.setField(service, "minSimilarity", 0.70d);
        when(knowledgeChunkRepository.findTopKBySimilarity(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(2)))
                .thenReturn(List.of(chunk(1L, 0.76d), chunk(2L, 0.69d)));

        RagContextResultDto result = service.searchContext(Collections.nCopies(3072, 1.0f), 2, "trace");

        assertThat(result.getFoundChunks()).isEqualTo(2);
        assertThat(result.getUsedChunks()).isEqualTo(1);
        assertThat(result.getBestScore()).isEqualTo(0.76d);
        assertThat(result.getChunks()).extracting(chunk -> chunk.getId()).containsExactly(1L);
    }

    private KnowledgeChunkRepository.ChunkSimilarityProjection chunk(Long id, double similarity) {
        return new KnowledgeChunkRepository.ChunkSimilarityProjection() {
            @Override
            public Long getId() {
                return id;
            }

            @Override
            public Integer getChunkIndex() {
                return 0;
            }

            @Override
            public String getContent() {
                return "context";
            }

            @Override
            public java.time.Instant getCreatedAt() {
                return java.time.Instant.parse("2026-01-01T00:00:00Z");
            }

            @Override
            public Double getScore() {
                return 1.0d - similarity;
            }
        };
    }
}
