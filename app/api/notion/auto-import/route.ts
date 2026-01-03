import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'
import { createClient } from '@supabase/supabase-js'

// Create Supabase client for server-side use
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

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

function blocksToHTML(blocks: any[]): string {
  let html = ''
  
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        if (block.paragraph.rich_text && block.paragraph.rich_text.length > 0) {
          html += `<p>${notionRichTextToHTML(block.paragraph.rich_text)}</p>`
        } else {
          html += '<p><br></p>'
        }
        break
      case 'heading_1':
        if (block.heading_1.rich_text && block.heading_1.rich_text.length > 0) {
          html += `<h1>${notionRichTextToHTML(block.heading_1.rich_text)}</h1>`
        }
        break
      case 'heading_2':
        if (block.heading_2.rich_text && block.heading_2.rich_text.length > 0) {
          html += `<h2>${notionRichTextToHTML(block.heading_2.rich_text)}</h2>`
        }
        break
      case 'heading_3':
        if (block.heading_3.rich_text && block.heading_3.rich_text.length > 0) {
          html += `<h3>${notionRichTextToHTML(block.heading_3.rich_text)}</h3>`
        }
        break
      case 'bulleted_list_item':
        if (block.bulleted_list_item.rich_text && block.bulleted_list_item.rich_text.length > 0) {
          html += `<ul><li>${notionRichTextToHTML(block.bulleted_list_item.rich_text)}</li></ul>`
        }
        break
      case 'numbered_list_item':
        if (block.numbered_list_item.rich_text && block.numbered_list_item.rich_text.length > 0) {
          html += `<ol><li>${notionRichTextToHTML(block.numbered_list_item.rich_text)}</li></ol>`
        }
        break
      case 'quote':
        if (block.quote.rich_text && block.quote.rich_text.length > 0) {
          html += `<blockquote>${notionRichTextToHTML(block.quote.rich_text)}</blockquote>`
        }
        break
      case 'code':
        if (block.code.rich_text && block.code.rich_text.length > 0) {
          const code = block.code.rich_text.map((t: any) => t.plain_text).join('')
          html += `<pre><code>${code}</code></pre>`
        }
        break
      case 'divider':
        html += '<hr>'
        break
      default:
        if (block[block.type]?.rich_text) {
          html += `<p>${notionRichTextToHTML(block[block.type].rich_text)}</p>`
        }
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
    const highlights: { text: string; html: string }[] = []
    let currentHighlightBlocks: any[] = []

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i] as any
      const isParagraph = block.type === 'paragraph'
      const isEmpty = isParagraph &&
        (!block.paragraph?.rich_text || block.paragraph.rich_text.length === 0)

      if (isEmpty && currentHighlightBlocks.length > 0) {
        const html = blocksToHTML(currentHighlightBlocks)
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
      const html = blocksToHTML(currentHighlightBlocks)
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

    // Get existing highlights to check for duplicates and updates
    const { data: existingHighlights, error: fetchError } = await supabase
      .from('highlights')
      .select('id, text, html_content')

    if (fetchError) throw fetchError

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

