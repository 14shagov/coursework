package com.example.ragchatbot.search;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SearchReindexWorker {
    private final SearchIndexService searchIndexService;

    @Async("searchReindexExecutor")
    public void run(long jobId) {
        searchIndexService.runReindex(jobId);
    }
}
