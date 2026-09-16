package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.SearchOutboxEvent;
import com.example.ragchatbot.entity.SearchOutboxStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SearchOutboxEventRepository extends JpaRepository<SearchOutboxEvent, Long> {
    List<SearchOutboxEvent> findTop100ByStatusInOrderByCreatedAtAsc(Collection<SearchOutboxStatus> statuses);
    List<SearchOutboxEvent> findByCreatedAtGreaterThanEqualOrderByCreatedAtAsc(Instant createdAt);
}
