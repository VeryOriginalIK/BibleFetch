-- Supabase setup SQL for BibleFetch collection sync
-- Run this in the Supabase SQL Editor

-- Create user_collections table
CREATE TABLE IF NOT EXISTS user_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE user_collections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own collections
CREATE POLICY "Users can view their own collections"
ON user_collections
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own collections
CREATE POLICY "Users can insert their own collections"
ON user_collections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own collections
CREATE POLICY "Users can update their own collections"
ON user_collections
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own collections
CREATE POLICY "Users can delete their own collections"
ON user_collections
FOR DELETE
USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row changes
CREATE TRIGGER update_user_collections_updated_at
BEFORE UPDATE ON user_collections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON user_collections TO authenticated;

-- Optional: Create a function to merge collections (upsert)
CREATE OR REPLACE FUNCTION upsert_user_collections(
  p_user_id UUID,
  p_data JSONB
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_collections (user_id, data)
  VALUES (p_user_id, p_data)
  ON CONFLICT (user_id)
  DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- PUBLIC COLLECTIONS TABLE
-- ================================================

-- Create public_collections table for sharing collections with other users
CREATE TABLE IF NOT EXISTS public_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_email TEXT,
  name TEXT NOT NULL,
  verse_ids TEXT[] NOT NULL DEFAULT '{}',
  theme_color TEXT,
  last_modified BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_public_collections_owner_id ON public_collections(owner_id);
CREATE INDEX IF NOT EXISTS idx_public_collections_name ON public_collections(name);
CREATE INDEX IF NOT EXISTS idx_public_collections_modified ON public_collections(last_modified DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public_collections ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (authenticated) can read public collections
CREATE POLICY "Anyone can view public collections"
ON public_collections
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users can insert their own collections
CREATE POLICY "Users can share their own collections"
ON public_collections
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Policy: Users can update their own public collections
CREATE POLICY "Users can update their own public collections"
ON public_collections
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Policy: Users can delete their own public collections
CREATE POLICY "Users can unshare their own collections"
ON public_collections
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- Trigger to automatically update updated_at on row changes
CREATE TRIGGER update_public_collections_updated_at
BEFORE UPDATE ON public_collections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public_collections TO authenticated;

-- Function to get trending public collections (most copied/popular)
COMMENT ON TABLE public_collections IS 'Stores publicly shared Bible verse collections from users';


-- COLLECTION VERSE LIKES TABLE
-- ================================================

-- Create collection_verse_likes table to track which verses users like in public collections
CREATE TABLE IF NOT EXISTS collection_verse_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id TEXT NOT NULL,
  verse_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(collection_id, verse_id, user_id) -- One like per user per verse per collection
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_verse_likes_collection ON collection_verse_likes(collection_id);
CREATE INDEX IF NOT EXISTS idx_verse_likes_verse ON collection_verse_likes(collection_id, verse_id);
CREATE INDEX IF NOT EXISTS idx_verse_likes_user ON collection_verse_likes(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE collection_verse_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (authenticated) can read verse likes
CREATE POLICY "Anyone can view verse likes"
ON collection_verse_likes
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users can insert their own likes
CREATE POLICY "Users can like verses"
ON collection_verse_likes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own likes
CREATE POLICY "Users can unlike verses"
ON collection_verse_likes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, DELETE ON collection_verse_likes TO authenticated;

COMMENT ON TABLE collection_verse_likes IS 'Tracks which users liked which verses in public collections';
