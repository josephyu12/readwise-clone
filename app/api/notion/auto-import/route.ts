import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'
import { createClient } from '@/lib/supabase/server'

// Convert Notion rich text to HTML (same as in import route)
function notionRichTextToHTML(richText: any[]): string {
  return richText.map((text: any) => {
    let content = text.plain_text || ''
    
    if (text.annotations.bold) content = `<strong>${content}</strong>`
    if (text.annotations.italic) content = `<em>${content}</em>`
    if (text.annotations.underline) content = `<u>${content}</u>`
    if (text.annotations.strikethrough) content = `<s>${content}</s>`
    if (text.annotations.code) content = `<code>${content}</code>`
    
    if (text.href) {
      content = `<a href="${text.href}">${content}</a>`
    }
    
    return content
  }).join('')
}

// Recursively fetch children blocks for a list item
async function fetchBlockChildren(notion: Client, blockId: string): Promise<any[]> {
  const children: any[] = []
  let cursor = undefined
  
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    })
    children.push(...response.results)
    cursor = response.next_cursor || undefined
  } while (cursor)
  
  return children
}

// Convert Notion blocks to HTML, preserving formatting and nested lists
async function blocksToHTML(blocks: any[], notion?: Client): Promise<string> {
  let html = ''
  let i = 0
  
  while (i < blocks.length) {
    const block = blocks[i] as any
    
    switch (block.type) {
      case 'paragraph':
        if (block.paragraph?.rich_text && block.paragraph.rich_text.length > 0) {
          html += `<p>${notionRichTextToHTML(block.paragraph.rich_text)}</p>`
        } else {
          html += '<p><br></p>'
        }
        i++
        break
      case 'heading_1':
        if (block.heading_1?.rich_text && block.heading_1.rich_text.length > 0) {
          html += `<h1>${notionRichTextToHTML(block.heading_1.rich_text)}</h1>`
        }
        i++
        break
      case 'heading_2':
        if (block.heading_2?.rich_text && block.heading_2.rich_text.length > 0) {
          html += `<h2>${notionRichTextToHTML(block.heading_2.rich_text)}</h2>`
        }
        i++
        break
      case 'heading_3':
        if (block.heading_3?.rich_text && block.heading_3.rich_text.length > 0) {
          html += `<h3>${notionRichTextToHTML(block.heading_3.rich_text)}</h3>`
        }
        i++
        break
      case 'bulleted_list_item':
        // Group consecutive bulleted list items at the same level
        const bulletedItems: any[] = []
        while (i < blocks.length && (blocks[i] as any).type === 'bulleted_list_item') {
          bulletedItems.push(blocks[i])
          i++
        }
        
        // Build nested list structure
        html += '<ul>'
        for (const item of bulletedItems) {
          const itemText = item.bulleted_list_item?.rich_text 
            ? notionRichTextToHTML(item.bulleted_list_item.rich_text)
            : ''
          
          // Check if this item has children (nested lists)
          // Try to fetch children - Notion API may not always set has_children correctly
          let nestedContent = ''
          if (notion && item.id) {
            try {
              const children = await fetchBlockChildren(notion, item.id)
              if (children && children.length > 0) {
                // Process children recursively - they might be nested list items
                nestedContent = await blocksToHTML(children, notion)
              }
            } catch (error: any) {
              // Silently fail - not all blocks have children or might not be accessible
              // This is expected for list items without nested content
            }
          }
          
          html += `<li>${itemText}${nestedContent}</li>`
        }
        html += '</ul>'
        break
      case 'numbered_list_item':
        // Group consecutive numbered list items at the same level
        const numberedItems: any[] = []
        while (i < blocks.length && (blocks[i] as any).type === 'numbered_list_item') {
          numberedItems.push(blocks[i])
          i++
        }
        
        // Build nested list structure
        html += '<ol>'
        for (const item of numberedItems) {
          const itemText = item.numbered_list_item?.rich_text 
            ? notionRichTextToHTML(item.numbered_list_item.rich_text)
            : ''
          
          // Check if this item has children (nested lists)
          // Try to fetch children - Notion API may not always set has_children correctly
          let nestedContent = ''
          if (notion && item.id) {
            try {
              const children = await fetchBlockChildren(notion, item.id)
              if (children && children.length > 0) {
                // Process children recursively - they might be nested list items
                nestedContent = await blocksToHTML(children, notion)
              }
            } catch (error: any) {
              // Silently fail - not all blocks have children or might not be accessible
              // This is expected for list items without nested content
            }
          }
          
          html += `<li>${itemText}${nestedContent}</li>`
        }
        html += '</ol>'
        break
      case 'quote':
        if (block.quote?.rich_text && block.quote.rich_text.length > 0) {
          html += `<blockquote>${notionRichTextToHTML(block.quote.rich_text)}</blockquote>`
        }
        i++
        break
      case 'code':
        if (block.code?.rich_text && block.code.rich_text.length > 0) {
          const code = block.code.rich_text.map((t: any) => t.plain_text).join('')
          html += `<pre><code>${code}</code></pre>`
        }
        i++
        break
      case 'divider':
        html += '<hr>'
        i++
        break
      case 'toggle':
        // Skip toggle blocks - don't include them in HTML
        // Also skip any children (they should be handled by the parent processing)
        i++
        break
      default:
        if (block[block.type]?.rich_text) {
          html += `<p>${notionRichTextToHTML(block[block.type].rich_text)}</p>`
        }
        i++
    }
  }
  
  return html
}

function blocksToText(blocks: any[]): string {
  return blocks
    .map((block: any) => {
      if (block[block.type]?.rich_text) {
        return block[block.type].rich_text.map((t: any) => t.plain_text).join('')
      }
      return ''
    })
    .filter((text: string) => text.length > 0)
    .join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get Notion credentials from environment variables
    const notionApiKey = process.env.NOTION_API_KEY
    const notionPageId = process.env.NOTION_PAGE_ID
    const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '') || 
                      request.nextUrl.searchParams.get('secret')

    // Verify cron secret for security
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Note: This cron job may need to be restructured to work with user-specific data
    // For now, it will only work if called with a valid user session
    // Consider using a service role key for cron jobs that need to access all users' data

    if (!notionApiKey || !notionPageId) {
      return NextResponse.json(
        { error: 'Notion API key and Page ID must be set in environment variables' },
        { status: 400 }
      )
    }

    // Initialize Notion client
    const notion = new Client({
      auth: notionApiKey,
    })

    // Fetch page content
    const blocks = []
    let cursor = undefined

    do {
      const response = await notion.blocks.children.list({
        block_id: notionPageId,
        start_cursor: cursor,
      })

      blocks.push(...response.results)
      cursor = response.next_cursor || undefined
    } while (cursor)

    // Process blocks and split by empty lines
    // Skip toggle blocks entirely (their children are nested and won't appear in top-level blocks)
    const highlights: { text: string; html: string }[] = []
    let currentHighlightBlocks: any[] = []

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i] as any
      
      // Skip toggle blocks entirely - their nested children won't be in the top-level blocks array
      if (block.type === 'toggle') {
        continue
      }
      
      const isParagraph = block.type === 'paragraph'
      const isEmpty = isParagraph &&
        (!block.paragraph?.rich_text || block.paragraph.rich_text.length === 0)

      if (isEmpty && currentHighlightBlocks.length > 0) {
        const html = await blocksToHTML(currentHighlightBlocks, notion)
        const text = blocksToText(currentHighlightBlocks)

        if (text.trim().length > 0) {
          highlights.push({ text: text.trim(), html: html.trim() })
        }

        currentHighlightBlocks = []
        continue
      }

      if (!isEmpty || currentHighlightBlocks.length > 0) {
        currentHighlightBlocks.push(block)
      }
    }

    if (currentHighlightBlocks.length > 0) {
      const html = await blocksToHTML(currentHighlightBlocks, notion)
      const text = blocksToText(currentHighlightBlocks)

      if (text.trim().length > 0) {
        highlights.push({ text: text.trim(), html: html.trim() })
      }
    }

    if (highlights.length === 0) {
      return NextResponse.json({
        message: 'No highlights found',
        imported: 0,
        skipped: 0,
      })
    }

    // Get ALL existing highlights to check for duplicates and updates
    // Paginate through all highlights to avoid Supabase's default limit
    const existingHighlights: any[] = []
    let fetchCursor = 0
    const pageSize = 1000
    
    while (true) {
      const { data: batch, error: fetchError } = await supabase
        .from('highlights')
        .select('id, text, html_content')
        .range(fetchCursor, fetchCursor + pageSize - 1)
      
      if (fetchError) throw fetchError
      
      if (!batch || batch.length === 0) break
      
      existingHighlights.push(...batch)
      
      // If we got fewer than pageSize, we've reached the end
      if (batch.length < pageSize) break
      
      fetchCursor += pageSize
    }

    // Helper function to normalize text for comparison
    const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
    
    // Helper function to calculate similarity (simple Levenshtein-like approach)
    const calculateSimilarity = (str1: string, str2: string): number => {
      const s1 = normalize(str1)
      const s2 = normalize(str2)
      if (s1 === s2) return 1.0
      if (s1.length === 0 || s2.length === 0) return 0.0
      
      // Simple similarity: check if one contains the other or vice versa
      if (s1.includes(s2) || s2.includes(s1)) {
        const longer = s1.length > s2.length ? s1 : s2
        const shorter = s1.length > s2.length ? s2 : s1
        return shorter.length / longer.length
      }
      
      // Check word overlap
      const words1 = s1.split(' ')
      const words2 = s2.split(' ')
      const commonWords = words1.filter(w => words2.includes(w))
      return (commonWords.length * 2) / (words1.length + words2.length)
    }

    const newHighlights: typeof highlights = []
    const updatedHighlights: Array<{ id: string; text: string; html: string }> = []
    let skipped = 0

    for (const highlight of highlights) {
      const textNormalized = normalize(highlight.text)
      const htmlNormalized = normalize(highlight.html)
      
      // Try to find a matching highlight
      let matched = false
      let bestMatch: { id: string; similarity: number } | null = null
      
      for (const existing of existingHighlights || []) {
        const existingText = normalize(existing.text || '')
        const existingHtml = normalize(existing.html_content || '')
        
        // Check exact match first
        if (existingText === textNormalized || existingHtml === htmlNormalized ||
            existingText === htmlNormalized || existingHtml === textNormalized) {
          // Exact match - check if content has changed
          const currentText = highlight.text.trim()
          const currentHtml = highlight.html.trim()
          const dbText = existing.text?.trim() || ''
          const dbHtml = existing.html_content?.trim() || ''
          
          if (currentText !== dbText || currentHtml !== dbHtml) {
            // Content has changed, update it
            updatedHighlights.push({
              id: existing.id,
              text: currentText,
              html: currentHtml,
            })
          } else {
            skipped++
          }
          matched = true
          break
        }
        
        // Check similarity for fuzzy matching (if text is similar enough, consider it the same)
        const textSimilarity = calculateSimilarity(highlight.text, existing.text || '')
        const htmlSimilarity = existing.html_content 
          ? calculateSimilarity(highlight.html, existing.html_content)
          : 0
        
        const maxSimilarity = Math.max(textSimilarity, htmlSimilarity)
        
        // If similarity is high enough (>= 0.8), consider it a match
        if (maxSimilarity >= 0.8) {
          if (!bestMatch || maxSimilarity > bestMatch.similarity) {
            bestMatch = { id: existing.id, similarity: maxSimilarity }
          }
        }
      }
      
      // If we found a fuzzy match, update it
      if (!matched && bestMatch) {
        updatedHighlights.push({
          id: bestMatch.id,
          text: highlight.text.trim(),
          html: highlight.html.trim(),
        })
        matched = true
      }
      
      // If no match found, it's a new highlight
      if (!matched) {
        newHighlights.push(highlight)
      }
    }

    // Update existing highlights that changed
    let updatedCount = 0
    for (const update of updatedHighlights) {
      const { error: updateError } = await supabase
        .from('highlights')
        .update({
          text: update.text,
          html_content: update.html || null,
        })
        .eq('id', update.id)
      
      if (!updateError) {
        updatedCount++
      } else {
        console.warn(`Failed to update highlight ${update.id}:`, updateError)
      }
    }

    // Import new highlights
    let importedCount = 0
    if (newHighlights.length > 0) {
      const highlightsToInsert = newHighlights.map((highlight) => ({
        text: highlight.text.trim(),
        html_content: highlight.html.trim() || null,
        source: process.env.NOTION_SOURCE || null,
        author: process.env.NOTION_AUTHOR || null,
        resurface_count: 0,
        average_rating: 0,
        rating_count: 0,
        archived: false,
      }))

      const { error: insertError } = await supabase
        .from('highlights')
        .insert(highlightsToInsert)

      if (insertError) throw insertError
      importedCount = newHighlights.length
    }

    return NextResponse.json({
      message: 'Sync completed successfully',
      imported: importedCount,
      updated: updatedCount,
      skipped: skipped,
      total: highlights.length,
    })
  } catch (error: any) {
    console.error('Error in auto-import:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import from Notion' },
      { status: 500 }
    )
  }
}

