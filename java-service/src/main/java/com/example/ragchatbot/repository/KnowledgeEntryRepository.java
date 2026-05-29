package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.KnowledgeEntry;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KnowledgeEntryRepository extends JpaRepository<KnowledgeEntry, Long> {
}
