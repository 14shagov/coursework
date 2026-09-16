package com.example.ragchatbot.search;

import java.util.Map;

public record SearchDocument(String id, Map<String, Object> source) {
}
