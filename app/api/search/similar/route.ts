import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Extract keywords from text
function extractKeywords(text: string): string[] {
  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase()
  
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'other', 'another', 'some', 'any', 'no', 'not', 'only', 'just', 'more', 'most',
    'very', 'too', 'so', 'than', 'then', 'there', 'their', 'them', 'these', 'those'
  ])
  
  const words = plainText.match(/\b[a-z]+\b/gi) || []
  
  const keywords = Array.from(new Set(
    words
      .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
      .slice(0, 20)
  ))
  
  return keywords
}

// Calculate similarity between two texts
function calculateSimilarity(text1: string, text2: string): number {
  const keywords1 = extractKeywords(text1)
  const keywords2 = extractKeywords(text2)
  
  if (keywords1.length === 0 || keywords2.length === 0) return 0
  
  const set1 = new Set(keywords1)
  const set2 = new Set(keywords2)
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}

export async function POST(request: NextRequest) {
  try {
    const { highlightId, text, htmlContent } = await request.json()

    if (!highlightId || !text) {
      return NextResponse.json(
        { error: 'Highlight ID and text are required' },
        { status: 400 }
      )
    }

    const highlightText = htmlContent || text

    // Get all highlights except the current one
    const { data: allHighlights, error } = await supabase
      .from('highlights')
      .select(`
        *,
        highlight_categories (
          category:categories (*)
        ),
        highlight_links_from:highlight_links!from_highlight_id (
          id,
          to_highlight_id,
          link_text,
          to_highlight:highlights!to_highlight_id (
            id,
            text,
            source,
            author
          )
        )
      `)
      .eq('archived', false)
      .neq('id', highlightId)
      .limit(1000) // Limit for performance

    if (error) throw error

    if (!allHighlights || allHighlights.length === 0) {
      return NextResponse.json({
        similar: [],
      })
    }

    // Calculate similarity scores
    const withSimilarity = allHighlights
      .map((h: any) => ({
        ...h,
        similarity: calculateSimilarity(
          highlightText,
          h.html_content || h.text
        ),
      }))
      .filter((h) => h.similarity > 0.15) // Higher threshold for "similar" highlights
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10) // Top 10 similar highlights

    const similar = withSimilarity.map((h: any) => ({
      ...h,
      categories: h.highlight_categories?.map((hc: any) => hc.category) || [],
      linked_highlights: h.highlight_links_from || [],
    }))

    return NextResponse.json({
      similar,
    })
  } catch (error: any) {
    console.error('Error finding similar highlights:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to find similar highlights' },
      { status: 500 }
    )
  }
}

