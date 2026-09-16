package com.example.ragchatbot.search;

import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.Message;
import com.example.ragchatbot.entity.TitleGenerationJob;
import com.example.ragchatbot.entity.TitleGenerationStatus;
import com.example.ragchatbot.entity.TitleOrigin;
import com.example.ragchatbot.repository.MessageRepository;
import com.example.ragchatbot.repository.TitleGenerationJobRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class TitleGenerationService {
    private final MessageRepository messageRepository;
    private final TitleGenerationJobRepository jobRepository;

    public void queueIfFirstUserMessage(Conversation conversation, Message message) {
        if (conversation.getTitleOrigin() != TitleOrigin.AUTO
                || conversation.getTitleGenerationStatus() != TitleGenerationStatus.PENDING
                || messageRepository.countByConversation_IdAndRole(conversation.getId(), com.example.ragchatbot.dto.MessageRole.USER) != 1
                || jobRepository.findByConversationId(conversation.getId()).isPresent()) {
            return;
        }
        TitleGenerationJob job = new TitleGenerationJob();
        job.setConversation(conversation);
        job.setMessage(message);
        job.setStatus(TitleGenerationStatus.PENDING);
        job.setCreatedAt(Instant.now());
        jobRepository.save(job);
    }

    public void cancel(long conversationId) {
        jobRepository.findByConversationId(conversationId).ifPresent(job -> {
            if (job.getStatus() == TitleGenerationStatus.PENDING || job.getStatus() == TitleGenerationStatus.RUNNING) {
                job.setStatus(TitleGenerationStatus.CANCELLED);
                job.setCompletedAt(Instant.now());
                jobRepository.save(job);
            }
        });
    }
}
