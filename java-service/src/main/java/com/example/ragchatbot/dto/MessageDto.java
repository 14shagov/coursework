package com.example.ragchatbot.dto;

import java.time.Instant;
import lombok.Data;

@Data
public class MessageDto {
    private Long id;
    private String role;
    private String content;
    private Instant createdAt;

    public MessageDto(Long id, String role, String content, Instant createdAt) {
        this.id = id;
        this.role = role;
        this.content = content;
        this.createdAt = createdAt;
    }
}
