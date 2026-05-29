package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {
}
