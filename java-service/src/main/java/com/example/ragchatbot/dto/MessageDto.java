package com.example.ragchatbot.dto;

import java.time.Instant;
import lombok.Data;

@Data
public class MessageDto {
    private Long id;
    private String role;
    private String content;
    private Instant createdAt;
}
