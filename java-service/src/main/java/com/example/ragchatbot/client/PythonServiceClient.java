package com.example.ragchatbot.client;

import com.example.ragchatbot.dto.ChatRequestDto;
import com.example.ragchatbot.dto.ChatResponseDto;
import com.example.ragchatbot.dto.EmbedRequestDto;
import com.example.ragchatbot.dto.EmbedResponseDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import reactor.core.publisher.Flux;

@FeignClient(name = "python-service", url = "${python.service.base-url}")
public interface PythonServiceClient {

    @PostMapping("/embed")
    EmbedResponseDto embed(@RequestBody EmbedRequestDto request);

    @PostMapping("/chat")
    ChatResponseDto chat(@RequestBody ChatRequestDto request);

    /**
     * Streaming chat endpoint for SSE.
     * If the Python service does not implement this endpoint,
     * Feign will return an error and the caller will fall back to non-streaming.
     */
    @PostMapping(value = "/chat/stream", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_PLAIN_VALUE)
    Flux<String> chatStreaming(@RequestBody ChatRequestDto request);
}
