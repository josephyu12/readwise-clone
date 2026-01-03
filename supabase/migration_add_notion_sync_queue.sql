-- Migration: Add notion_sync_queue table for background Notion sync operations
-- This allows Notion syncs to happen asynchronously and be retried on failure

-- Create table to store pending Notion sync operations
CREATE TABLE IF NOT EXISTS notion_sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  highlight_id UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'update', 'delete')),
  text TEXT,
  html_content TEXT,
  original_text TEXT, -- Original text before update (for finding the block in Notion)
  original_html_content TEXT, -- Original HTML before update
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  error_message TEXT,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE, -- When to retry failed items (exponential backoff)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_notion_sync_queue_user_id ON notion_sync_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notion_sync_queue_status ON notion_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_notion_sync_queue_created_at ON notion_sync_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_notion_sync_queue_highlight_id ON notion_sync_queue(highlight_id);

-- Composite index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_notion_sync_queue_status_created ON notion_sync_queue(status, created_at) 
  WHERE status IN ('pending', 'failed');

-- Enable Row Level Security
ALTER TABLE notion_sync_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own sync queue items" ON notion_sync_queue;
CREATE POLICY "Users can view their own sync queue items" ON notion_sync_queue
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own sync queue items" ON notion_sync_queue;
CREATE POLICY "Users can insert their own sync queue items" ON notion_sync_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own sync queue items" ON notion_sync_queue;
CREATE POLICY "Users can update their own sync queue items" ON notion_sync_queue
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own sync queue items" ON notion_sync_queue;
CREATE POLICY "Users can delete their own sync queue items" ON notion_sync_queue
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notion_sync_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_notion_sync_queue_updated_at ON notion_sync_queue;
CREATE TRIGGER update_notion_sync_queue_updated_at
  BEFORE UPDATE ON notion_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_notion_sync_queue_updated_at();

