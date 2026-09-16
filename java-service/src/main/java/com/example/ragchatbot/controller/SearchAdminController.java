package com.example.ragchatbot.controller;

import com.example.ragchatbot.dto.SearchReindexJobResponseDto;
import com.example.ragchatbot.search.SearchIndexService;
import com.example.ragchatbot.search.SearchReindexWorker;
import com.example.ragchatbot.security.JwtUserIdExtractor;
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
@RequestMapping("/api/admin/search")
@RequiredArgsConstructor
public class SearchAdminController {
    private final SearchIndexService searchIndexService;
    private final SearchReindexWorker searchReindexWorker;

    @PostMapping("/reindex")
    public ResponseEntity<SearchReindexJobResponseDto> startReindex(@AuthenticationPrincipal Jwt jwt) {
        long id = searchIndexService.startReindex(JwtUserIdExtractor.extract(jwt));
        searchReindexWorker.run(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(searchIndexService.getReindexJob(id));
    }

    @GetMapping("/reindex/{id}")
    public ResponseEntity<SearchReindexJobResponseDto> getReindex(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        JwtUserIdExtractor.extract(jwt);
        return ResponseEntity.ok(searchIndexService.getReindexJob(id));
    }
}
