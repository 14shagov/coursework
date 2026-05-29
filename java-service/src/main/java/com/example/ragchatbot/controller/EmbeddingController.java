package com.example.ragchatbot.controller;

import com.example.ragchatbot.service.EmbeddingInitService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/embeddings")
@RequiredArgsConstructor
public class EmbeddingController {

    private final EmbeddingInitService embeddingInitService;

    @PostMapping("/init")
    public ResponseEntity<String> initEmbeddings() {
        embeddingInitService.initMissingEmbeddings();
        return ResponseEntity.accepted().body("Embedding initialization started");
    }
}
