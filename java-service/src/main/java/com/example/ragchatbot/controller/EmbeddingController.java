package com.example.ragchatbot.controller;

import com.example.ragchatbot.dto.EmbeddingJobResponseDto;
import com.example.ragchatbot.security.JwtUserIdExtractor;
import com.example.ragchatbot.service.EmbeddingJobService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/embeddings")
@RequiredArgsConstructor
public class EmbeddingController {

    private final EmbeddingJobService embeddingJobService;

    @PostMapping("/jobs")
    public ResponseEntity<EmbeddingJobResponseDto> startJob(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(embeddingJobService.startJob(JwtUserIdExtractor.extract(jwt)));
    }

    @GetMapping("/jobs/{id}")
    public ResponseEntity<EmbeddingJobResponseDto> getJob(@PathVariable long id) {
        return ResponseEntity.ok(embeddingJobService.getJob(id));
    }

}
