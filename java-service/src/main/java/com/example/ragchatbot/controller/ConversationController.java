package com.example.ragchatbot.controller;

import com.example.ragchatbot.dto.ConversationCreateDto;
import com.example.ragchatbot.dto.ConversationResponseDto;
import com.example.ragchatbot.dto.MessageDto;
import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.dto.StreamingChatChunk;
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
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
@Slf4j
public class ConversationController {

    private final ChatService chatService;

    @PostMapping
    public ResponseEntity<ConversationResponseDto> createConversation(@AuthenticationPrincipal Jwt jwt,
                                                                        @Valid @RequestBody ConversationCreateDto request) {
        long userId = currentUserId(jwt);
        log.info("[chat-api] createConversation userId={}, mode={}, title={}", userId, request.getMode(), request.getTitle());
        ConversationResponseDto dto = chatService.createConversation(
                userId, request.getTitle(), request.getMode());
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    @GetMapping
    public ResponseEntity<List<ConversationResponseDto>> listConversations(@AuthenticationPrincipal Jwt jwt) {
        long userId = currentUserId(jwt);
        log.info("[chat-api] listConversations userId={}", userId);
        return ResponseEntity.ok(chatService.listConversations(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConversationResponseDto> getConversation(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        log.info("[chat-api] getConversation conversationId={}", id);
        return ResponseEntity.ok(chatService.getConversation(currentUserId(jwt), id));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<List<MessageDto>> getHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        log.info("[chat-api] getHistory conversationId={}", id);
        return ResponseEntity.ok(chatService.getHistory(currentUserId(jwt), id));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<MessageResponseDto> sendMessage(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                                           @Valid @RequestBody MessageRequestDto request) {
        log.info("[chat-api] sendMessage:start conversationId={}, contentLength={}", id, request.getContent().length());
        return ResponseEntity.ok(chatService.sendMessage(currentUserId(jwt), id, request.getContent()));
    }

    @PostMapping(value = "/{id}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<ServerSentEvent<StreamingChatChunk>>> sendMessageStreaming(@AuthenticationPrincipal Jwt jwt,
                                                                                              @PathVariable Long id,
                                                                                              @Valid @RequestBody MessageRequestDto request) {
        log.info("[chat-api] sendMessageStreaming:start conversationId={}", id);
        Flux<StreamingChatChunk> flux = chatService.sendMessageStreaming(currentUserId(jwt), id, request.getContent());
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

    private long currentUserId(Jwt jwt) {
        Object uid = jwt == null ? null : jwt.getClaim("uid");
        if (uid instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(uid));
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT does not contain a valid uid claim");
        }
    }
}
