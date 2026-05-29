package com.example.ragchatbot.service.impl;

import com.example.ragchatbot.service.KnowledgeService;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeServiceImpl implements KnowledgeService {

    @Override
    public List<String> splitIntoChunks(String content, int chunkSize, int overlap) {
        if (content == null || content.isBlank() || chunkSize <= 0) {
            return List.of();
        }
        int step = Math.max(1, chunkSize - Math.max(0, overlap));
        List<String> chunks = new ArrayList<>();
        for (int i = 0; i < content.length(); i += step) {
            int end = Math.min(content.length(), i + chunkSize);
            chunks.add(content.substring(i, end));
            if (end == content.length()) {
                break;
            }
        }
        return chunks;
    }
}
