-- Migration: Add retry fields to notion_sync_queue for better retry handling
-- This allows failed items to be retried after exponential backoff delays

-- Add retry tracking fields
ALTER TABLE notion_sync_queue 
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of items ready to retry
CREATE INDEX IF NOT EXISTS idx_notion_sync_queue_next_retry ON notion_sync_queue(next_retry_at) 
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

