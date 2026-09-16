--liquibase formatted sql
--changeset ragchatbot:007-chat-titles-and-search

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS title_origin VARCHAR(16) NOT NULL DEFAULT 'USER',
    ADD COLUMN IF NOT EXISTS title_generation_status VARCHAR(16) NOT NULL DEFAULT 'READY',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP;

UPDATE conversations
SET last_message_at = created_at
WHERE last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_last_message
    ON conversations(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS title_generation_jobs (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL UNIQUE,
    message_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT fk_title_generation_job_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_title_generation_job_message
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_title_generation_jobs_status
    ON title_generation_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS search_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    aggregate_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_outbox_status
    ON search_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS search_reindex_jobs (
    id BIGSERIAL PRIMARY KEY,
    requested_by_user_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    total_documents INT NOT NULL DEFAULT 0,
    processed_documents INT NOT NULL DEFAULT 0,
    failed_documents INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT fk_search_reindex_job_user
        FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
