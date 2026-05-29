package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.entity.KnowledgeChunk;
import java.util.List;

public interface RagService {
    RagContextResultDto retrieveContext(String userMessage, int topK, String traceId);

    String buildContextPrompt(List<KnowledgeChunk> chunks, String traceId);
}
