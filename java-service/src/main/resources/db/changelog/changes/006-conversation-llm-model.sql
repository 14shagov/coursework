--liquibase formatted sql
--changeset ragchatbot:006-conversation-llm-model
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS llm_model VARCHAR(255);
