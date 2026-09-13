package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.EmbeddingJob;
import com.example.ragchatbot.entity.EmbeddingJobStatus;
import java.time.Instant;
import java.util.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface EmbeddingJobRepository extends JpaRepository<EmbeddingJob, Long> {

    @Modifying
    @Transactional
    @Query("update EmbeddingJob job set job.status = :failedStatus, job.errorMessage = :message, "
            + "job.completedAt = :completedAt where job.status in :activeStatuses")
    int failInterruptedActiveJobs(@Param("message") String message,
                                  @Param("completedAt") Instant completedAt,
                                  @Param("failedStatus") EmbeddingJobStatus failedStatus,
                                  @Param("activeStatuses") Collection<EmbeddingJobStatus> activeStatuses);
}
