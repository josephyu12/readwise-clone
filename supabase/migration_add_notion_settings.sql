-- Migration: Add user_notion_settings table for per-user Notion integration
-- This allows each user to configure their own Notion API key and page ID

-- Create table to store user Notion settings
CREATE TABLE IF NOT EXISTS user_notion_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notion_api_key TEXT NOT NULL,
  notion_page_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_notion_settings_user_id ON user_notion_settings(user_id);

-- Enable Row Level Security
ALTER TABLE user_notion_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own notion settings" ON user_notion_settings;
CREATE POLICY "Users can view their own notion settings" ON user_notion_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own notion settings" ON user_notion_settings;
CREATE POLICY "Users can insert their own notion settings" ON user_notion_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notion settings" ON user_notion_settings;
CREATE POLICY "Users can update their own notion settings" ON user_notion_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notion settings" ON user_notion_settings;
CREATE POLICY "Users can delete their own notion settings" ON user_notion_settings
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_notion_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_user_notion_settings_updated_at ON user_notion_settings;
CREATE TRIGGER update_user_notion_settings_updated_at
  BEFORE UPDATE ON user_notion_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_notion_settings_updated_at();

