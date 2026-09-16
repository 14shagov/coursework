package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.TitleGenerationJob;
import com.example.ragchatbot.entity.TitleGenerationStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TitleGenerationJobRepository extends JpaRepository<TitleGenerationJob, Long> {
    Optional<TitleGenerationJob> findByConversationId(Long conversationId);
    List<TitleGenerationJob> findTop10ByStatusInOrderByCreatedAtAsc(Collection<TitleGenerationStatus> statuses);
}
