import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Extract keywords from text (simple approach)
function extractKeywords(text: string): string[] {
  // Remove HTML tags
  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase()
  
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'other', 'another', 'some', 'any', 'no', 'not', 'only', 'just', 'more', 'most',
    'very', 'too', 'so', 'than', 'then', 'there', 'their', 'them', 'these', 'those'
  ])
  
  // Extract words (alphanumeric sequences)
  const words = plainText.match(/\b[a-z]+\b/gi) || []
  
  // Filter out stop words and short words, return unique keywords
  const keywords = Array.from(new Set(
    words
      .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
      .slice(0, 20) // Limit to top 20 keywords
  ))
  
  return keywords
}

// Calculate similarity between two texts using keyword overlap
function calculateSimilarity(text1: string, text2: string): number {
  const keywords1 = extractKeywords(text1)
  const keywords2 = extractKeywords(text2)
  
  if (keywords1.length === 0 || keywords2.length === 0) return 0
  
  // Calculate Jaccard similarity (intersection over union)
  const set1 = new Set(keywords1)
  const set2 = new Set(keywords2)
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}

export async function POST(request: NextRequest) {
  try {
    const { query, type } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    const searchType = type || 'fulltext'

    if (searchType === 'fulltext') {
      // Full-text search using PostgreSQL's text search
      // We'll use ILIKE for pattern matching (can be enhanced with tsvector/tsquery for better performance)
      const { data: highlights, error } = await supabase
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
        .or(`text.ilike.%${query}%,html_content.ilike.%${query}%`)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const processedHighlights = (highlights || []).map((h: any) => ({
        ...h,
        categories: h.highlight_categories?.map((hc: any) => hc.category) || [],
        linked_highlights: h.highlight_links_from || [],
      }))

      // For full-text search, also find similar highlights
      const queryKeywords = extractKeywords(query)
      const similar: any[] = []

      if (queryKeywords.length > 0) {
        // Get all highlights to calculate similarity
        const { data: allHighlights } = await supabase
          .from('highlights')
          .select('id, text, html_content')
          .eq('archived', false)
          .limit(1000) // Limit for performance

        if (allHighlights) {
          const similarities = allHighlights
            .map((h) => ({
              ...h,
              similarity: calculateSimilarity(
                query,
                h.html_content || h.text
              ),
            }))
            .filter((h) => h.similarity > 0.1) // Minimum similarity threshold
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 10) // Top 10 similar

          // Fetch full details for similar highlights
          if (similarities.length > 0) {
            const similarIds = similarities.map((s) => s.id)
            const { data: similarHighlights } = await supabase
              .from('highlights')
              .select(`
                *,
                highlight_categories (
                  category:categories (*)
                )
              `)
              .in('id', similarIds)
              .eq('archived', false)

            if (similarHighlights) {
              similar.push(...similarHighlights.map((h: any) => ({
                ...h,
                categories: h.highlight_categories?.map((hc: any) => hc.category) || [],
              })))
            }
          }
        }
      }

      return NextResponse.json({
        results: processedHighlights,
        similar: similar.filter((h) => !processedHighlights.some((r: any) => r.id === h.id)),
      })
    } else {
      // Semantic search using keyword similarity
      const queryKeywords = extractKeywords(query)

      if (queryKeywords.length === 0) {
        return NextResponse.json({
          results: [],
          similar: [],
        })
      }

      // Get all highlights to calculate similarity
      const { data: allHighlights } = await supabase
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
        .limit(1000) // Limit for performance

      if (!allHighlights) {
        return NextResponse.json({
          results: [],
          similar: [],
        })
      }

      // Calculate similarity scores
      const withSimilarity = allHighlights
        .map((h: any) => ({
          ...h,
          similarity: calculateSimilarity(
            query,
            h.html_content || h.text
          ),
        }))
        .filter((h) => h.similarity > 0.1) // Minimum similarity threshold
        .sort((a, b) => b.similarity - a.similarity)

      // Split into results (top matches) and similar (others)
      const results = withSimilarity.slice(0, 20).map((h: any) => ({
        ...h,
        categories: h.highlight_categories?.map((hc: any) => hc.category) || [],
        linked_highlights: h.highlight_links_from || [],
      }))

      const similar = withSimilarity.slice(20, 30).map((h: any) => ({
        ...h,
        categories: h.highlight_categories?.map((hc: any) => hc.category) || [],
        linked_highlights: h.highlight_links_from || [],
      }))

      return NextResponse.json({
        results,
        similar,
      })
    }
  } catch (error: any) {
    console.error('Error performing search:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to perform search' },
      { status: 500 }
    )
  }
}

