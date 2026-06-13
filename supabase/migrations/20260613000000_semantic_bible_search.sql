-- Enable pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create verse embeddings table
CREATE TABLE public.verse_embeddings (
  id text PRIMARY KEY,           -- e.g. "GEN.1.1"
  book text NOT NULL,
  chapter int NOT NULL,
  verse int NOT NULL,
  text text NOT NULL,            -- KJV verse text
  embedding vector(384),
  created_at timestamptz DEFAULT now()
);

-- Create index for similarity search
CREATE INDEX ON verse_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Similarity search function
CREATE OR REPLACE FUNCTION search_verses(query_embedding vector(384), match_count int DEFAULT 10)
RETURNS TABLE (id text, book text, chapter int, verse int, text text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, book, chapter, verse, text, 1 - (embedding <=> query_embedding) AS similarity
  FROM verse_embeddings
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Enable Row-Level Security
ALTER TABLE public.verse_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow public read access (no auth required)
CREATE POLICY "Allow public read access"
  ON public.verse_embeddings
  FOR SELECT
  TO public
  USING (true);
