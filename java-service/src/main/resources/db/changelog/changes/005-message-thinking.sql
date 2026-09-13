--liquibase formatted sql

--changeset ragchatbot:005-message-thinking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thinking TEXT;
