CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    mode VARCHAR(10) NOT NULL CHECK (mode IN ('PLAIN', 'RAG')),
    title VARCHAR(255) NOT NULL,
    llm_model VARCHAR(255),
    title_origin VARCHAR(16) NOT NULL DEFAULT 'USER',
    title_generation_status VARCHAR(16) NOT NULL DEFAULT 'READY',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMP,
    CONSTRAINT fk_conversations_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ASSISTANT')),
    content TEXT NOT NULL,
    thinking TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_knowledge_entries_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(3072),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_knowledge_chunks_entry
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
    CONSTRAINT uq_knowledge_chunk UNIQUE (entry_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_last_message
    ON conversations(user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_user_id
    ON knowledge_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entry_id
    ON knowledge_chunks(entry_id);

CREATE TABLE IF NOT EXISTS embedding_jobs (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_embedding_jobs_one_active
    ON embedding_jobs ((1))
    WHERE status IN ('QUEUED', 'RUNNING');

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
