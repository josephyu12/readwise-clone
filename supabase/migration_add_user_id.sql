-- Add user_id column to all tables that need user isolation

-- Add user_id to categories
ALTER TABLE categories ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to highlights
ALTER TABLE highlights ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to daily_summaries
ALTER TABLE daily_summaries ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Note: Junction tables (highlight_categories, highlight_links, daily_summary_highlights, highlight_months_reviewed)
-- don't need user_id because they reference tables that already have user_id
-- RLS policies on those tables will ensure users can only access their own data through the parent tables

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all operations on categories" ON categories;
DROP POLICY IF EXISTS "Allow all operations on highlights" ON highlights;
DROP POLICY IF EXISTS "Allow all operations on daily_summaries" ON daily_summaries;
DROP POLICY IF EXISTS "Allow all operations on daily_summary_highlights" ON daily_summary_highlights;
DROP POLICY IF EXISTS "Allow all operations on highlight_categories" ON highlight_categories;
DROP POLICY IF EXISTS "Allow all operations on highlight_links" ON highlight_links;
DROP POLICY IF EXISTS "Allow all operations on highlight_months_reviewed" ON highlight_months_reviewed;

-- Create user-specific policies for categories
CREATE POLICY "Users can view their own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Create user-specific policies for highlights
CREATE POLICY "Users can view their own highlights" ON highlights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own highlights" ON highlights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own highlights" ON highlights
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own highlights" ON highlights
  FOR DELETE USING (auth.uid() = user_id);

-- Create user-specific policies for daily_summaries
CREATE POLICY "Users can view their own daily_summaries" ON daily_summaries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily_summaries" ON daily_summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily_summaries" ON daily_summaries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily_summaries" ON daily_summaries
  FOR DELETE USING (auth.uid() = user_id);

-- Create user-specific policies for daily_summary_highlights
-- Users can only access daily_summary_highlights for their own daily_summaries
CREATE POLICY "Users can view their own daily_summary_highlights" ON daily_summary_highlights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM daily_summaries
      WHERE daily_summaries.id = daily_summary_highlights.daily_summary_id
      AND daily_summaries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own daily_summary_highlights" ON daily_summary_highlights
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_summaries
      WHERE daily_summaries.id = daily_summary_highlights.daily_summary_id
      AND daily_summaries.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = daily_summary_highlights.highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own daily_summary_highlights" ON daily_summary_highlights
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM daily_summaries
      WHERE daily_summaries.id = daily_summary_highlights.daily_summary_id
      AND daily_summaries.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_summaries
      WHERE daily_summaries.id = daily_summary_highlights.daily_summary_id
      AND daily_summaries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own daily_summary_highlights" ON daily_summary_highlights
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM daily_summaries
      WHERE daily_summaries.id = daily_summary_highlights.daily_summary_id
      AND daily_summaries.user_id = auth.uid()
    )
  );

-- Create user-specific policies for highlight_categories
-- Users can only access highlight_categories for their own highlights and categories
CREATE POLICY "Users can view their own highlight_categories" ON highlight_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_categories.highlight_id
      AND highlights.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM categories
      WHERE categories.id = highlight_categories.category_id
      AND categories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own highlight_categories" ON highlight_categories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_categories.highlight_id
      AND highlights.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM categories
      WHERE categories.id = highlight_categories.category_id
      AND categories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own highlight_categories" ON highlight_categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_categories.highlight_id
      AND highlights.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_categories.highlight_id
      AND highlights.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM categories
      WHERE categories.id = highlight_categories.category_id
      AND categories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own highlight_categories" ON highlight_categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_categories.highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

-- Create user-specific policies for highlight_links
-- Users can only access highlight_links for their own highlights
CREATE POLICY "Users can view their own highlight_links" ON highlight_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.from_highlight_id
      AND highlights.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.to_highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own highlight_links" ON highlight_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.from_highlight_id
      AND highlights.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.to_highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own highlight_links" ON highlight_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.from_highlight_id
      AND highlights.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.from_highlight_id
      AND highlights.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.to_highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own highlight_links" ON highlight_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_links.from_highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

-- Create user-specific policies for highlight_months_reviewed
-- Users can only access highlight_months_reviewed for their own highlights
CREATE POLICY "Users can view their own highlight_months_reviewed" ON highlight_months_reviewed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_months_reviewed.highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own highlight_months_reviewed" ON highlight_months_reviewed
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_months_reviewed.highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own highlight_months_reviewed" ON highlight_months_reviewed
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_months_reviewed.highlight_id
      AND highlights.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_months_reviewed.highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own highlight_months_reviewed" ON highlight_months_reviewed
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM highlights
      WHERE highlights.id = highlight_months_reviewed.highlight_id
      AND highlights.user_id = auth.uid()
    )
  );

