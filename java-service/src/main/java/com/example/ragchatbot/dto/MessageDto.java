package com.example.ragchatbot.dto;

import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MessageDto {
    private Long id;
    private String role;
    private String content;
    private Instant createdAt;
}
