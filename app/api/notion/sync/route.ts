import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Client } from '@notionhq/client'

// Import the HTML to Notion conversion functions
// We'll need to extract these to a shared utility or duplicate the logic
function htmlToNotionRichText(html: string): any[] {
  if (!html || html.trim() === '') {
    return []
  }

  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  const richText: any[] = []
  const plainText = stripHtml(html)
  
  if (plainText) {
    const hasBold = /<strong|<b/i.test(html)
    const hasItalic = /<em|<i/i.test(html)
    const hasUnderline = /<u/i.test(html)
    const hasCode = /<code/i.test(html)
    
    const linkRegex = /<a\s+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi
    let linkMatch
    const links: Array<{ href: string; text: string; start: number; end: number }> = []
    
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const linkText = stripHtml(linkMatch[2])
      const linkStart = plainText.indexOf(linkText)
      if (linkStart !== -1) {
        links.push({
          href: linkMatch[1],
          text: linkText,
          start: linkStart,
          end: linkStart + linkText.length,
        })
      }
    }
    
    let currentPos = 0
    const sortedLinks = links.sort((a, b) => a.start - b.start)
    
    for (const link of sortedLinks) {
      if (link.start > currentPos) {
        const beforeText = plainText.substring(currentPos, link.start)
        if (beforeText) {
          richText.push({
            type: 'text',
            text: { content: beforeText },
            annotations: {
              bold: hasBold,
              italic: hasItalic,
              strikethrough: false,
              underline: hasUnderline,
              code: hasCode,
              color: 'default',
            },
            plain_text: beforeText,
          })
        }
      }
      
      richText.push({
        type: 'text',
        text: { content: link.text, link: { url: link.href } },
        annotations: {
          bold: hasBold,
          italic: hasItalic,
          strikethrough: false,
          underline: hasUnderline,
          code: hasCode,
          color: 'default',
        },
        plain_text: link.text,
      })
      
      currentPos = link.end
    }
    
    if (currentPos < plainText.length) {
      const remainingText = plainText.substring(currentPos)
      if (remainingText) {
        richText.push({
          type: 'text',
          text: { content: remainingText },
          annotations: {
            bold: hasBold,
            italic: hasItalic,
            strikethrough: false,
            underline: hasUnderline,
            code: hasCode,
            color: 'default',
          },
          plain_text: remainingText,
        })
      }
    }
    
    if (richText.length === 0) {
      richText.push({
        type: 'text',
        text: { content: plainText },
        annotations: {
          bold: hasBold,
          italic: hasItalic,
          strikethrough: false,
          underline: hasUnderline,
          code: hasCode,
          color: 'default',
        },
        plain_text: plainText,
      })
    }
  }
  
  return richText.length > 0 ? richText : [{
    type: 'text',
    text: { content: plainText || html },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    plain_text: plainText || html,
  }]
}

function htmlToNotionBlocks(html: string): any[] {
  if (!html || html.trim() === '') {
    return [{
      type: 'paragraph',
      paragraph: { rich_text: [] },
    }]
  }

  const blocks: any[] = []
  const ulRegex = /<ul[^>]*>(.*?)<\/ul>/gis
  const olRegex = /<ol[^>]*>(.*?)<\/ol>/gis
  
  let ulMatch
  while ((ulMatch = ulRegex.exec(html)) !== null) {
    const listContent = ulMatch[1]
    const liRegex = /<li[^>]*>(.*?)<\/li>/gis
    let liMatch
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      const richText = htmlToNotionRichText(liMatch[1])
      if (richText.length > 0) {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: richText },
        })
      }
    }
  }
  
  let olMatch
  while ((olMatch = olRegex.exec(html)) !== null) {
    const listContent = olMatch[1]
    const liRegex = /<li[^>]*>(.*?)<\/li>/gis
    let liMatch
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      const richText = htmlToNotionRichText(liMatch[1])
      if (richText.length > 0) {
        blocks.push({
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: richText },
        })
      }
    }
  }
  
  let remainingHtml = html
    .replace(/<ul[^>]*>.*?<\/ul>/gis, '')
    .replace(/<ol[^>]*>.*?<\/ol>/gis, '')
  
  const h1Regex = /<h1[^>]*>(.*?)<\/h1>/gi
  let h1Match
  while ((h1Match = h1Regex.exec(remainingHtml)) !== null) {
    const richText = htmlToNotionRichText(h1Match[1])
    if (richText.length > 0) {
      blocks.push({
        type: 'heading_1',
        heading_1: { rich_text: richText },
      })
    }
    remainingHtml = remainingHtml.replace(h1Match[0], '')
  }
  
  const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi
  let h2Match
  while ((h2Match = h2Regex.exec(remainingHtml)) !== null) {
    const richText = htmlToNotionRichText(h2Match[1])
    if (richText.length > 0) {
      blocks.push({
        type: 'heading_2',
        heading_2: { rich_text: richText },
      })
    }
    remainingHtml = remainingHtml.replace(h2Match[0], '')
  }
  
  const h3Regex = /<h3[^>]*>(.*?)<\/h3>/gi
  let h3Match
  while ((h3Match = h3Regex.exec(remainingHtml)) !== null) {
    const richText = htmlToNotionRichText(h3Match[1])
    if (richText.length > 0) {
      blocks.push({
        type: 'heading_3',
        heading_3: { rich_text: richText },
      })
    }
    remainingHtml = remainingHtml.replace(h3Match[0], '')
  }
  
  const blockquoteRegex = /<blockquote[^>]*>(.*?)<\/blockquote>/gi
  let blockquoteMatch
  while ((blockquoteMatch = blockquoteRegex.exec(remainingHtml)) !== null) {
    const richText = htmlToNotionRichText(blockquoteMatch[1])
    if (richText.length > 0) {
      blocks.push({
        type: 'quote',
        quote: { rich_text: richText },
      })
    }
    remainingHtml = remainingHtml.replace(blockquoteMatch[0], '')
  }
  
  const preRegex = /<pre[^>]*>(.*?)<\/pre>/gis
  let preMatch
  while ((preMatch = preRegex.exec(remainingHtml)) !== null) {
    const code = remainingHtml.substring(preMatch.index, preMatch.index + preMatch[0].length)
      .replace(/<[^>]*>/g, '')
      .trim()
    if (code) {
      blocks.push({
        type: 'code',
        code: {
          rich_text: [{
            type: 'text',
            text: { content: code },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default',
            },
            plain_text: code,
          }],
          language: 'plain text',
        },
      })
    }
    remainingHtml = remainingHtml.replace(preMatch[0], '')
  }
  
  const pRegex = /<p[^>]*>(.*?)<\/p>/gi
  let pMatch
  while ((pMatch = pRegex.exec(remainingHtml)) !== null) {
    const richText = htmlToNotionRichText(pMatch[1])
    if (richText.length > 0 || pMatch[1].trim() === '') {
      blocks.push({
        type: 'paragraph',
        paragraph: { rich_text: richText },
      })
    }
  }
  
  if (blocks.length === 0) {
    const plainText = remainingHtml.replace(/<[^>]*>/g, '').trim()
    if (plainText) {
      const richText = htmlToNotionRichText(html)
      blocks.push({
        type: 'paragraph',
        paragraph: { rich_text: richText },
      })
    }
  }
  
  return blocks.length > 0 ? blocks : [{
    type: 'paragraph',
    paragraph: { rich_text: htmlToNotionRichText(html) },
  }]
}

// Process a single queue item
async function processQueueItem(supabase: any, queueItem: any, notionSettings: any) {
  const notion = new Client({
    auth: notionSettings.notion_api_key,
  })

  try {
    if (queueItem.operation_type === 'add') {
      const blocks = htmlToNotionBlocks(queueItem.html_content || queueItem.text)
      blocks.push({
        type: 'paragraph',
        paragraph: { rich_text: [] },
      })

      await notion.blocks.children.append({
        block_id: notionSettings.notion_page_id,
        children: blocks,
      })
    } else if (queueItem.operation_type === 'update') {
      // For update, use the ORIGINAL text stored in the queue item to find the block
      // The queue item stores both original and new text
      const originalText = (queueItem.original_html_content || queueItem.original_text || '').trim().toLowerCase()
      const originalPlainText = (queueItem.original_text || '').trim().toLowerCase()

      if (!originalText && !originalPlainText) {
        // Fallback: try to get from database (but it will have the new text)
        const { data: currentHighlight } = await supabase
          .from('highlights')
          .select('text, html_content')
          .eq('id', queueItem.highlight_id)
          .maybeSingle()
        
        if (currentHighlight) {
          // Use current text as fallback (less accurate but better than nothing)
          const fallbackText = (currentHighlight.html_content || currentHighlight.text).trim().toLowerCase()
          if (fallbackText) {
            console.warn('Using current highlight text as fallback for Notion matching (original text not stored in queue)')
          }
        }
      }

      // Convert new content to Notion blocks
      const newBlocks = htmlToNotionBlocks(queueItem.html_content || queueItem.text)
      
      // Fetch all blocks from Notion page
      const allBlocks: any[] = []
      let cursor = undefined
      
      do {
        const response = await notion.blocks.children.list({
          block_id: notionSettings.notion_page_id,
          start_cursor: cursor,
        })
        allBlocks.push(...response.results)
        cursor = response.next_cursor || undefined
      } while (cursor)

      // Function to extract plain text from a block
      const getBlockText = (block: any): string => {
        if (block[block.type]?.rich_text) {
          return block[block.type].rich_text
            .map((t: any) => t.plain_text || '')
            .join('')
            .trim()
            .toLowerCase()
        }
        return ''
      }

      // Find matching blocks (blocks that contain the original text)
      // Group blocks by empty line separators (like in the import logic)
      const matchingBlocks: any[] = []
      let currentHighlightBlocks: any[] = []
      let foundMatch = false

      for (let i = 0; i < allBlocks.length; i++) {
        const block = allBlocks[i]
        const isParagraph = block.type === 'paragraph'
        const isEmpty = isParagraph &&
          (!block.paragraph?.rich_text || block.paragraph.rich_text.length === 0)

        if (isEmpty && currentHighlightBlocks.length > 0) {
          // Check if this group of blocks matches the original highlight
          const combinedText = currentHighlightBlocks
            .map(getBlockText)
            .join(' ')
            .trim()
            .toLowerCase()

          if (combinedText === originalText || combinedText === originalPlainText || 
              combinedText.includes(originalPlainText) || originalPlainText.includes(combinedText)) {
            matchingBlocks.push(...currentHighlightBlocks)
            foundMatch = true
            break
          }

          currentHighlightBlocks = []
          continue
        }

        if (!isEmpty || currentHighlightBlocks.length > 0) {
          currentHighlightBlocks.push(block)
        }
      }

      // Check the last group if we haven't found a match
      if (!foundMatch && currentHighlightBlocks.length > 0) {
        const combinedText = currentHighlightBlocks
          .map(getBlockText)
          .join(' ')
          .trim()
          .toLowerCase()

        if (combinedText === originalText || combinedText === originalPlainText ||
            combinedText.includes(originalPlainText) || originalPlainText.includes(combinedText)) {
          matchingBlocks.push(...currentHighlightBlocks)
          foundMatch = true
        }
      }

      if (!foundMatch || matchingBlocks.length === 0) {
        throw new Error('Highlight not found in Notion page. It may have been deleted or moved.')
      }

      // Update the matching blocks with new content
      // Update the first block and delete/add others as needed
      const firstBlock = matchingBlocks[0]
      const firstNewBlock = newBlocks[0]

      if (firstBlock.type === firstNewBlock?.type) {
        // Same type, update in place
        await notion.blocks.update({
          block_id: firstBlock.id,
          [firstBlock.type]: firstNewBlock[firstBlock.type],
        })
      } else {
        // Different type, delete and recreate
        await notion.blocks.delete({ block_id: firstBlock.id })
        if (firstNewBlock) {
          await notion.blocks.children.append({
            block_id: notionSettings.notion_page_id,
            children: [firstNewBlock],
          })
        }
      }

      // Delete remaining old blocks
      for (let i = 1; i < matchingBlocks.length; i++) {
        try {
          await notion.blocks.delete({ block_id: matchingBlocks[i].id })
        } catch (error) {
          console.warn(`Failed to delete block ${matchingBlocks[i].id}:`, error)
        }
      }

      // Add remaining new blocks
      for (let i = 1; i < newBlocks.length; i++) {
        try {
          await notion.blocks.children.append({
            block_id: notionSettings.notion_page_id,
            children: [newBlocks[i]],
          })
        } catch (error) {
          console.warn(`Failed to append block:`, error)
        }
      }
    }
    // 'delete' operation can be implemented if needed

    // Mark as completed
    await supabase
      .from('notion_sync_queue')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id)

    return { success: true }
  } catch (error: any) {
    // Mark as failed and increment retry count
    const newRetryCount = queueItem.retry_count + 1
    const shouldRetry = newRetryCount < queueItem.max_retries
    
    // Calculate next retry time with exponential backoff
    // 1st retry: 5 minutes, 2nd: 15 min, 3rd: 45 min, 4th: 2 hours, 5th: 6 hours
    // After 5 retries, continue with longer delays: 12h, 24h, 48h, etc.
    const backoffMinutes = newRetryCount <= 5 
      ? [5, 15, 45, 120, 360][newRetryCount - 1] || 360
      : Math.min(24 * 60 * Math.pow(2, newRetryCount - 6), 7 * 24 * 60) // Cap at 7 days
    
    const nextRetryAt = new Date()
    nextRetryAt.setMinutes(nextRetryAt.getMinutes() + backoffMinutes)

    await supabase
      .from('notion_sync_queue')
      .update({
        status: shouldRetry ? 'pending' : 'failed',
        retry_count: newRetryCount,
        error_message: error.message || 'Unknown error',
        last_retry_at: new Date().toISOString(),
        next_retry_at: shouldRetry ? null : nextRetryAt.toISOString(), // Only set next_retry_at for failed items
        processed_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id)

    return { success: false, error: error.message, shouldRetry }
  }
}

// Process queue items for a user
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's Notion settings
    const { data: notionSettings, error: settingsError } = await supabase
      .from('user_notion_settings')
      .select('notion_api_key, notion_page_id, enabled')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .maybeSingle()

    if (settingsError || !notionSettings) {
      return NextResponse.json({
        processed: 0,
        message: 'Notion integration not configured',
      })
    }

    // Get pending queue items for this user (limit to 10 at a time)
    // Include:
    // 1. Items with status 'pending' that haven't exceeded max retries
    // 2. Items with status 'failed' that are past their next_retry_at time
    const now = new Date().toISOString()
    const { data: queueItems, error: queueError } = await supabase
      .from('notion_sync_queue')
      .select('*')
      .eq('user_id', user.id)
      .or(`and(status.eq.pending,retry_count.lt.5),and(status.eq.failed,retry_count.lt.20,or(next_retry_at.is.null,next_retry_at.lte.${now}))`)
      .order('created_at', { ascending: true })
      .limit(10)

    if (queueError) throw queueError

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        processed: 0,
        message: 'No pending items to process',
      })
    }

    // Mark items as processing
    const itemIds = queueItems.map((item: any) => item.id)
    await supabase
      .from('notion_sync_queue')
      .update({ status: 'processing' })
      .in('id', itemIds)

    // Process each item
    let processed = 0
    let failed = 0

    for (const item of queueItems) {
      const result = await processQueueItem(supabase, item, notionSettings)
      if (result.success) {
        processed++
      } else {
        failed++
      }
    }

    return NextResponse.json({
      processed,
      failed,
      total: queueItems.length,
    })
  } catch (error: any) {
    console.error('Error processing Notion sync queue:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process sync queue' },
      { status: 500 }
    )
  }
}

// Get queue status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: stats, error } = await supabase
      .from('notion_sync_queue')
      .select('status')
      .eq('user_id', user.id)

    if (error) throw error

    const pending = stats?.filter((s: any) => s.status === 'pending').length || 0
    const processing = stats?.filter((s: any) => s.status === 'processing').length || 0
    const failed = stats?.filter((s: any) => s.status === 'failed').length || 0
    const readyToRetry = stats?.filter((s: any) => 
      s.status === 'failed' && 
      (!s.next_retry_at || new Date(s.next_retry_at) <= new Date())
    ).length || 0

    return NextResponse.json({
      pending,
      processing,
      failed,
      readyToRetry,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get queue status' },
      { status: 500 }
    )
  }
}

