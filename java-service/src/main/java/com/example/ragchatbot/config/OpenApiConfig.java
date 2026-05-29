package com.example.ragchatbot.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "RAG Chatbot API",
                version = "1.0.0",
                description = "Учебный API для plain LLM и RAG режимов"
        )
)
public class OpenApiConfig {
}
