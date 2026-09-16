package com.example.ragchatbot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "search.elasticsearch")
public record SearchProperties(
        String url,
        String alias,
        boolean enabled
) {
}
