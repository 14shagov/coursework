package com.example.ragchatbot.dto;

import java.util.List;
import lombok.Data;

@Data
public class ChatRequestDto {
    private List<ChatMessageDto> messages;
    private List<String> contextChunks;
}
