package com.example.ragchatbot.controller;

import com.example.ragchatbot.dto.ConversationCreateDto;
import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageDto;
import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.dto.StreamingChatChunk;
import com.example.ragchatbot.security.JwtUserIdExtractor;
import com.example.ragchatbot.service.ChatService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
@Slf4j
public class ConversationController {

    private final ChatService chatService;

    @PostMapping
    public ResponseEntity<ConversationResponseDto> createConversation(@AuthenticationPrincipal Jwt jwt,
                                                                        @Valid @RequestBody ConversationCreateDto request) {
        long userId = JwtUserIdExtractor.extract(jwt);
        log.info("[chat-api] createConversation userId={}, mode={}, title={}", userId, request.getMode(), request.getTitle());
        ConversationResponseDto dto = chatService.createConversation(
                userId, request.getTitle(), request.getMode());
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    @GetMapping
    public ResponseEntity<List<ConversationResponseDto>> listConversations(@AuthenticationPrincipal Jwt jwt) {
        long userId = JwtUserIdExtractor.extract(jwt);
        log.info("[chat-api] listConversations userId={}", userId);
        return ResponseEntity.ok(chatService.listConversations(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConversationResponseDto> getConversation(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        log.info("[chat-api] getConversation conversationId={}", id);
        return ResponseEntity.ok(chatService.getConversation(JwtUserIdExtractor.extract(jwt), id));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<List<MessageDto>> getHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        log.info("[chat-api] getHistory conversationId={}", id);
        return ResponseEntity.ok(chatService.getHistory(JwtUserIdExtractor.extract(jwt), id));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<MessageResponseDto> sendMessage(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                                           @Valid @RequestBody MessageRequestDto request) {
        log.info("[chat-api] sendMessage:start conversationId={}, contentLength={}", id, request.getContent().length());
        return ResponseEntity.ok(chatService.sendMessage(JwtUserIdExtractor.extract(jwt), id, request.getContent()));
    }

    @PostMapping(value = "/{id}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<ServerSentEvent<StreamingChatChunk>>> sendMessageStreaming(@AuthenticationPrincipal Jwt jwt,
                                                                                              @PathVariable Long id,
                                                                                              @Valid @RequestBody MessageRequestDto request) {
        log.info("[chat-api] sendMessageStreaming:start conversationId={}", id);
        Flux<StreamingChatChunk> flux = chatService.sendMessageStreaming(JwtUserIdExtractor.extract(jwt), id, request.getContent());
        return ResponseEntity.ok()
                .header("Content-Type", "text/event-stream")
                .header("Cache-Control", "no-cache, no-transform")
                .header("Connection", "keep-alive")
                .header("X-Accel-Buffering", "no")
                .body(flux.map(chunk -> ServerSentEvent.<StreamingChatChunk>builder()
                        .event("message")
                        .data(chunk)
                        .build()));
    }

}
