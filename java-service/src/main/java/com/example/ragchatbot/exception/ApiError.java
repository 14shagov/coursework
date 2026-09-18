package com.example.ragchatbot.exception;

import java.util.Map;

public record ApiError(String message, Map<String, String> fields) {
}
