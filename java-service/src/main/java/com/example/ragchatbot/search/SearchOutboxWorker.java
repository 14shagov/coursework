package com.example.ragchatbot.search;

import com.example.ragchatbot.entity.SearchOutboxEvent;
import com.example.ragchatbot.entity.SearchOutboxStatus;
import com.example.ragchatbot.repository.SearchOutboxEventRepository;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class SearchOutboxWorker {
    private final SearchOutboxEventRepository repository;
    private final SearchIndexService searchIndexService;
    private final AtomicBoolean running = new AtomicBoolean();

    @Scheduled(fixedDelayString = "${search.elasticsearch.poll-ms:1000}")
    public void process() {
        if (!searchIndexService.enabled() || !running.compareAndSet(false, true)) return;
        try {
            List<SearchOutboxEvent> events = repository.findTop100ByStatusInOrderByCreatedAtAsc(List.of(SearchOutboxStatus.PENDING));
            for (SearchOutboxEvent event : events) processOne(event.getId());
        } finally {
            running.set(false);
        }
    }

    private void processOne(long eventId) {
        SearchOutboxEvent event = repository.findById(eventId).orElse(null);
        if (event == null || event.getStatus() != SearchOutboxStatus.PENDING) return;
        event.setStatus(SearchOutboxStatus.RUNNING);
        event.setAttempts(event.getAttempts() + 1);
        repository.save(event);
        try {
            searchIndexService.apply(event, null);
            event.setStatus(SearchOutboxStatus.COMPLETED);
            event.setProcessedAt(Instant.now());
            event.setErrorMessage(null);
        } catch (Exception exception) {
            event.setStatus(event.getAttempts() >= 3 ? SearchOutboxStatus.FAILED : SearchOutboxStatus.PENDING);
            event.setErrorMessage("Elasticsearch synchronization failed");
            log.warn("[search-outbox] failed eventId={}, type={}", eventId, exception.getClass().getSimpleName());
        }
        repository.save(event);
    }
}
