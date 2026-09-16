package com.example.ragchatbot.search;

import com.example.ragchatbot.entity.SearchOutboxEvent;
import com.example.ragchatbot.entity.SearchOutboxEventType;
import com.example.ragchatbot.entity.SearchOutboxStatus;
import com.example.ragchatbot.repository.SearchOutboxEventRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SearchOutboxPublisher {
    private final SearchOutboxEventRepository repository;

    public void publish(SearchOutboxEventType eventType, Long aggregateId) {
        SearchOutboxEvent event = new SearchOutboxEvent();
        event.setEventType(eventType);
        event.setAggregateId(aggregateId);
        event.setStatus(SearchOutboxStatus.PENDING);
        event.setCreatedAt(Instant.now());
        repository.save(event);
    }
}
