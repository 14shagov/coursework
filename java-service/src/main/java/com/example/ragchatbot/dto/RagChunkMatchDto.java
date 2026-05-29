package com.example.ragchatbot.dto;

import com.example.ragchatbot.entity.KnowledgeChunk;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RagChunkMatchDto {
    private KnowledgeChunk chunk;
    private double score;
}
