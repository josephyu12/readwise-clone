-- Migration: Add original_text and original_html_content fields to notion_sync_queue
-- These fields store the original content before an update, allowing us to find
-- the correct block in Notion even when content is deleted or shortened

-- Add original text fields to notion_sync_queue table
ALTER TABLE notion_sync_queue 
ADD COLUMN IF NOT EXISTS original_text TEXT,
ADD COLUMN IF NOT EXISTS original_html_content TEXT;

-- Add comment to explain the purpose
COMMENT ON COLUMN notion_sync_queue.original_text IS 'Original text before update (used to find the block in Notion)';
COMMENT ON COLUMN notion_sync_queue.original_html_content IS 'Original HTML content before update (used to find the block in Notion)';

