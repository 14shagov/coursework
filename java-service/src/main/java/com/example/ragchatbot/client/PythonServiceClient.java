package com.example.ragchatbot.client;

import com.example.ragchatbot.dto.ChatRequestDto;
import com.example.ragchatbot.dto.ChatResponseDto;
import com.example.ragchatbot.dto.EmbedRequestDto;
import com.example.ragchatbot.dto.EmbedResponseDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "python-service", url = "${python.service.base-url}")
public interface PythonServiceClient {

    @PostMapping("/embed")
    EmbedResponseDto embed(@RequestBody EmbedRequestDto request);

    @PostMapping("/chat")
    ChatResponseDto chat(@RequestBody ChatRequestDto request);
}
