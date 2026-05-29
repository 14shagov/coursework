package com.example.ragchatbot.repository;

import com.example.ragchatbot.entity.KnowledgeChunk;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface KnowledgeChunkRepository extends JpaRepository<KnowledgeChunk, Long> {

    interface ChunkSimilarityProjection {
        Long getId();
        Integer getChunkIndex();
        String getContent();
        java.time.Instant getCreatedAt();
        Double getScore();
    }

    @Query(value = "SELECT id, entry_id, chunk_index, content, created_at " +
            "FROM knowledge_chunks " +
            "WHERE embedding IS NULL",
            nativeQuery = true)
    List<KnowledgeChunk> findByEmbeddingIsNull();

    // score = cosine distance (embedding <=> query): меньше = релевантнее
    // entry_id убран из SELECT — в ChunkSimilarityProjection нет getEntryId()
    @Query(value = "SELECT id, chunk_index AS chunkIndex, content, created_at AS createdAt, " +
            "(embedding <=> CAST(:embedding AS vector)) AS score " +
            "FROM knowledge_chunks " +
            "WHERE embedding IS NOT NULL " +
            "ORDER BY score " +
            "LIMIT :limit",
            nativeQuery = true)
    List<ChunkSimilarityProjection> findTopKBySimilarity(@Param("embedding") String embedding,
                                                         @Param("limit") int limit);

    @Modifying
    @Query(value = "UPDATE knowledge_chunks SET embedding = CAST(:embedding AS vector) WHERE id = :chunkId",
            nativeQuery = true)
    int updateEmbeddingByChunkId(@Param("chunkId") Long chunkId,
                                 @Param("embedding") String embedding);
}