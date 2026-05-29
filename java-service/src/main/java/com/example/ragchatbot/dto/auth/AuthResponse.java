package com.example.ragchatbot.dto.auth;

public record AuthResponse(String accessToken, String tokenType, long expiresInSeconds, Long userId, String username) {
}
