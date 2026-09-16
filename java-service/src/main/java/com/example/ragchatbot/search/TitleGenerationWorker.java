package com.example.ragchatbot.search;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.dto.TitleRequestDto;
import com.example.ragchatbot.dto.TitleResponseDto;
import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.TitleGenerationJob;
import com.example.ragchatbot.entity.TitleGenerationStatus;
import com.example.ragchatbot.entity.TitleOrigin;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.TitleGenerationJobRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Slf4j
public class TitleGenerationWorker {
    private static final int MAX_ATTEMPTS = 3;

    private final TitleGenerationJobRepository jobRepository;
    private final ConversationRepository conversationRepository;
    private final PythonServiceClient pythonServiceClient;
    private final SearchOutboxPublisher searchOutboxPublisher;

    @Scheduled(fixedDelayString = "${chat.title-generation.poll-ms:1000}")
    @Transactional
    public void processPendingJobs() {
        List<TitleGenerationJob> jobs = jobRepository.findTop10ByStatusInOrderByCreatedAtAsc(List.of(TitleGenerationStatus.PENDING));
        jobs.forEach(job -> process(job.getId()));
    }

    @Transactional
    public void process(long jobId) {
        TitleGenerationJob job = jobRepository.findById(jobId).orElse(null);
        if (job == null || job.getStatus() != TitleGenerationStatus.PENDING) return;

        Conversation conversation = job.getConversation();
        if (conversation.getTitleOrigin() != TitleOrigin.AUTO) {
            job.setStatus(TitleGenerationStatus.CANCELLED);
            job.setCompletedAt(Instant.now());
            jobRepository.save(job);
            return;
        }

        job.setStatus(TitleGenerationStatus.RUNNING);
        job.setAttempts(job.getAttempts() + 1);
        job.setStartedAt(Instant.now());
        conversation.setTitleGenerationStatus(TitleGenerationStatus.RUNNING);
        jobRepository.save(job);
        conversationRepository.save(conversation);

        try {
            TitleRequestDto request = new TitleRequestDto();
            request.setContent(job.getMessage().getContent());
            TitleResponseDto response = pythonServiceClient.title(request);
            String title = normalize(response == null ? null : response.getTitle());
            if (title.isBlank()) throw new IllegalStateException("Generated title is blank");

            Conversation latest = conversationRepository.findById(conversation.getId()).orElseThrow();
            if (latest.getTitleOrigin() == TitleOrigin.AUTO) {
                latest.setTitle(title);
                latest.setTitleGenerationStatus(TitleGenerationStatus.READY);
                latest.setUpdatedAt(Instant.now());
                conversationRepository.save(latest);
                searchOutboxPublisher.publish(com.example.ragchatbot.entity.SearchOutboxEventType.UPSERT_CONVERSATION, latest.getId());
            }
            job.setStatus(TitleGenerationStatus.READY);
            job.setCompletedAt(Instant.now());
            jobRepository.save(job);
        } catch (Exception exception) {
            job.setErrorMessage("Title generation failed");
            if (job.getAttempts() >= MAX_ATTEMPTS) {
                job.setStatus(TitleGenerationStatus.FAILED);
                conversation.setTitleGenerationStatus(TitleGenerationStatus.FAILED);
            } else {
                job.setStatus(TitleGenerationStatus.PENDING);
                conversation.setTitleGenerationStatus(TitleGenerationStatus.PENDING);
            }
            job.setCompletedAt(job.getStatus() == TitleGenerationStatus.FAILED ? Instant.now() : null);
            jobRepository.save(job);
            conversationRepository.save(conversation);
            log.warn("[title-generation] failed jobId={}, attempt={}, type={}", jobId, job.getAttempts(),
                    exception.getClass().getSimpleName());
        }
    }

    private String normalize(String title) {
        if (title == null) return "";
        String normalized = title.replaceAll("\\s+", " ").trim().replaceAll("^[\\\"'«]+|[\\\"'»]+$", "");
        return normalized.length() <= 60 ? normalized : normalized.substring(0, 60).trim();
    }
}
