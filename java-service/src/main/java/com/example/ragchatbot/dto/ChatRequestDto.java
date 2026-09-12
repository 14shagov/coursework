package com.example.ragchatbot.dto;

import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ChatRequestDto {
    private List<ChatMessageDto> messages;
    private List<String> contextChunks;
}
