package com.example.ragchatbot.dto;

import com.example.ragchatbot.entity.KnowledgeChunk;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RagContextResultDto {
    private List<KnowledgeChunk> chunks;
    private int foundChunks;
    private int usedChunks;
    private Double bestScore;
    private double threshold;
}
