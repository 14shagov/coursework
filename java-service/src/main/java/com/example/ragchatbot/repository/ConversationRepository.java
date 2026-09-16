package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.Conversation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {
    List<Conversation> findByUserIdOrderByLastMessageAtDesc(Long userId);

    Optional<Conversation> findByIdAndUserId(Long id, Long userId);
}
