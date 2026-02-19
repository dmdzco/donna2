-- HNSW index for cosine distance on memories table.
-- Converts O(n) sequential scan to approximate nearest-neighbor search.
-- Run manually against Neon DB before deploying code.
-- CONCURRENTLY prevents table locks during index creation.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_embedding_hnsw
ON memories USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Standard index on senior_id (used in WHERE clause for all memory queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_senior_id
ON memories (senior_id);
