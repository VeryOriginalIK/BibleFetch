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
