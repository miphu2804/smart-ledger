-- Embeddings live in PostgreSQL (ADR-0001). Plain CREATE EXTENSION keeps the
-- migration portable between Supabase and the pgvector CI image.
CREATE EXTENSION IF NOT EXISTS vector;
