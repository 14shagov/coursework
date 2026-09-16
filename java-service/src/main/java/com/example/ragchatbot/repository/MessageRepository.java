package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.Message;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByConversationIdOrderByCreatedAtAsc(Long conversationId);

    Optional<Message> findByIdAndConversation_User_Id(Long id, Long userId);

    long countByConversation_IdAndRole(Long conversationId, com.example.ragchatbot.dto.MessageRole role);
}
