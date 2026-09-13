CREATE TABLE embedding_jobs (
    id BIGSERIAL PRIMARY KEY,
    requested_by_user_id BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(16) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
    total_chunks INTEGER NOT NULL DEFAULT 0,
    processed_chunks INTEGER NOT NULL DEFAULT 0,
    skipped_chunks INTEGER NOT NULL DEFAULT 0,
    failed_chunks INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX uq_embedding_jobs_one_active
    ON embedding_jobs ((1))
    WHERE status IN ('QUEUED', 'RUNNING');
