package com.example.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.StreamingChatChunk;
import com.example.ragchatbot.service.ChatService;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.security.oauth2.jwt.Jwt;
import reactor.core.publisher.Flux;

class ConversationControllerTest {

    @Test
    void usesUidFromJwtForConversationLookup() {
        ChatService chatService = mock(ChatService.class);
        ConversationController controller = new ConversationController(chatService);
        Jwt jwt = new Jwt("token", Instant.now(), Instant.now().plusSeconds(60),
                Map.of("alg", "HS256"), Map.of("uid", 7));
        when(chatService.getConversation(7L, 22L))
                .thenReturn(new ConversationResponseDto(22L, 7L, "PLAIN", "Chat", Instant.now()));

        controller.getConversation(jwt, 22L);

        verify(chatService).getConversation(7L, 22L);
    }

    @Test
    void disablesProxyBufferingForStreamingResponses() {
        ChatService chatService = mock(ChatService.class);
        ConversationController controller = new ConversationController(chatService);
        Jwt jwt = new Jwt("token", Instant.now(), Instant.now().plusSeconds(60),
                Map.of("alg", "HS256"), Map.of("uid", 7));
        MessageRequestDto request = new MessageRequestDto();
        request.setContent("Question");
        when(chatService.sendMessageStreaming(7L, 22L, "Question")).thenReturn(Flux.empty());

        ResponseEntity<Flux<ServerSentEvent<StreamingChatChunk>>> response =
                controller.sendMessageStreaming(jwt, 22L, request);

        assertThat(response.getHeaders().getFirst("X-Accel-Buffering")).isEqualTo("no");
        assertThat(response.getHeaders().getFirst("Cache-Control")).isEqualTo("no-cache, no-transform");
    }
}
