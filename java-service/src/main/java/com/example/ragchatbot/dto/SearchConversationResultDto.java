package com.example.ragchatbot.dto;

import java.time.Instant;

public record SearchConversationResultDto(
        Long conversationId,
        String title,
        String matchedIn,
        String snippet,
        Long matchedMessageId,
        Instant lastMessageAt
) {
}
