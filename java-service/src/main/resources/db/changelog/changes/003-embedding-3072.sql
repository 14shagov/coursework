ALTER TABLE knowledge_chunks
    ALTER COLUMN embedding TYPE vector(3072) USING embedding::vector(3072);
