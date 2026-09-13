package com.example.ragchatbot.service.impl;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.dto.EmbedResponseDto;
import com.example.ragchatbot.repository.KnowledgeChunkRepository;
import java.util.Collections;
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
}
