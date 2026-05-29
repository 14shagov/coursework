package com.example.ragchatbot.controller;

import com.example.ragchatbot.dto.ConversationCreateDto;
import com.example.ragchatbot.dto.MessageDto;
import com.example.ragchatbot.dto.MessageRequestDto;
import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.service.ChatService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
@Slf4j
public class ConversationController {

    private final ChatService chatService;

    @PostMapping
    public ResponseEntity<Long> createConversation(@RequestBody ConversationCreateDto request) {
        log.info("[chat-api] createConversation userId={}, mode={}, title={}",
                request.getUserId(), request.getMode(), request.getTitle());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.createConversation(request.getUserId(), request.getTitle(), request.getMode().name()));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<List<MessageDto>> getHistory(@PathVariable Long id) {
        log.info("[chat-api] getHistory conversationId={}", id);
        return ResponseEntity.ok(List.of());
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<MessageResponseDto> sendMessage(@PathVariable Long id,
                                                          @RequestBody MessageRequestDto request) {
        log.info("[chat-api] sendMessage:start conversationId={}, mode={}, contentLength={}",
                id, request.getMode(), request.getContent() == null ? 0 : request.getContent().length());
        return ResponseEntity.ok(chatService.sendMessage(id, request));
    }

}
