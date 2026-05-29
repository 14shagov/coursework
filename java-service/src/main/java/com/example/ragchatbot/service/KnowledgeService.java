package com.example.ragchatbot.service;

import java.util.List;

public interface KnowledgeService {
    List<String> splitIntoChunks(String content, int chunkSize, int overlap);
}
