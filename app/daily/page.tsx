'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { DailySummary, DailySummaryHighlight } from '@/types/database'
import Link from 'next/link'
import { format } from 'date-fns'

export default function DailyPage() {
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const loadDailySummary = useCallback(async (selectedDate: string) => {
    setLoading(true)
    try {
      // First, ensure today's summary exists
      await ensureDailySummary(selectedDate)

      // Then load it
      const { data: summaryData, error } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('date', selectedDate)
        .maybeSingle()

      if (error) throw error

      if (summaryData) {
        // Get highlights for this summary with their ratings
        const { data: summaryHighlights, error: highlightsError } = await supabase
          .from('daily_summary_highlights')
          .select(`
            id,
            highlight_id,
            rating,
            highlight:highlights (
              id,
              text,
              html_content,
              source,
              author,
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
            )
          `)
          .eq('daily_summary_id', summaryData.id)

        if (highlightsError) throw highlightsError

        const processedHighlights = (summaryHighlights || []).map((sh: any) => ({
          id: sh.id,
          daily_summary_id: summaryData.id,
          highlight_id: sh.highlight_id,
          rating: sh.rating,
          highlight: sh.highlight
            ? {
                ...sh.highlight,
                categories: sh.highlight.highlight_categories?.map((hc: any) => hc.category) || [],
                linked_highlights: sh.highlight.highlight_links_from || [],
              }
            : null,
        }))

        setSummary({
          id: summaryData.id,
          date: summaryData.date,
          highlights: processedHighlights,
          created_at: summaryData.created_at,
        })
      } else {
        setSummary(null)
      }
    } catch (error) {
      console.error('Error loading daily summary:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDailySummary(date)
  }, [date, loadDailySummary])

  const handleRatingChange = async (
    summaryHighlightId: string,
    highlightId: string,
    rating: 'low' | 'med' | 'high' | null
  ) => {
    try {
      // Update the rating in daily_summary_highlights
      const { error: updateError } = await supabase
        .from('daily_summary_highlights')
        .update({ rating })
        .eq('id', summaryHighlightId)

      if (updateError) throw updateError

      // Recalculate average rating for the highlight
      const { data: allRatings, error: ratingsError } = await supabase
        .from('daily_summary_highlights')
        .select('rating')
        .eq('highlight_id', highlightId)
        .not('rating', 'is', null)

      if (ratingsError) throw ratingsError

      // Calculate average (low=0, med=1, high=2)
      const ratingValues: number[] = (allRatings || []).map((r) => {
        if (r.rating === 'low') return 0
        if (r.rating === 'med') return 1
        return 2
      })

      const average = ratingValues.length > 0
        ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
        : 0

      // Count how many times this highlight has been marked as "low"
      const lowRatingsCount = (allRatings || []).filter((r) => r.rating === 'low').length

      // If marked as "low" twice or more, archive it
      const shouldArchive = lowRatingsCount >= 2

      // Update highlight with new average rating and archived status
      await supabase
        .from('highlights')
        .update({
          average_rating: average,
          rating_count: ratingValues.length,
          archived: shouldArchive,
        })
        .eq('id', highlightId)

      // Reload summary to reflect changes
      await loadDailySummary(date)
    } catch (error) {
      console.error('Error updating rating:', error)
    }
  }

  const ensureDailySummary = async (selectedDate: string) => {
    try {
      // Check if summary exists
      const { data: existing, error: checkError } = await supabase
        .from('daily_summaries')
        .select('id')
        .eq('date', selectedDate)
        .maybeSingle()

      if (checkError && checkError.code !== 'PGRST116') throw checkError
      if (existing) return

      // Get the current month in YYYY-MM format
      const date = new Date(selectedDate)
      const currentMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      // Get all highlights (excluding archived ones)
      const { data: allHighlights, error: highlightsError } = await supabase
        .from('highlights')
        .select('*')
        .eq('archived', false)
        .order('created_at', { ascending: false })

      if (highlightsError) throw highlightsError

      if (!allHighlights || allHighlights.length === 0) {
        // No highlights, but create empty summary
        const { error: insertError } = await supabase
          .from('daily_summaries')
          .insert([{ date: selectedDate }])

        if (insertError) throw insertError
        return
      }

      // Get which highlights have already been reviewed this month
      const { data: reviewedThisMonth, error: reviewedError } = await supabase
        .from('highlight_months_reviewed')
        .select('highlight_id')
        .eq('month_year', currentMonth)

      if (reviewedError) throw reviewedError

      const reviewedIds = new Set((reviewedThisMonth || []).map((r) => r.highlight_id))

      // Filter to only highlights that haven't been reviewed this month
      const highlightsNeedingReview = allHighlights.filter(
        (h) => !reviewedIds.has(h.id)
      )

      if (highlightsNeedingReview.length === 0) {
        // All highlights have been reviewed this month, create empty summary
        const { error: insertError } = await supabase
          .from('daily_summaries')
          .insert([{ date: selectedDate }])

        if (insertError) throw insertError
        return
      }

      // Calculate how many highlights to show per day
      // Distribute all unreviewed highlights across the month
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
      const dayOfMonth = date.getDate()
      const highlightsPerDay = Math.ceil(highlightsNeedingReview.length / daysInMonth)
      
      // Calculate which highlights to show today
      // Start from the beginning and show highlightsPerDay per day
      const startIndex = (dayOfMonth - 1) * highlightsPerDay
      const endIndex = Math.min(startIndex + highlightsPerDay, highlightsNeedingReview.length)
      const highlightsToShow = highlightsNeedingReview.slice(startIndex, endIndex)

      if (highlightsToShow.length === 0) {
        // No highlights for today, create empty summary
        const { error: insertError } = await supabase
          .from('daily_summaries')
          .insert([{ date: selectedDate }])

        if (insertError) throw insertError
        return
      }

      // Create daily summary
      const { data: summaryData, error: summaryError } = await supabase
        .from('daily_summaries')
        .insert([{ date: selectedDate }])
        .select()
        .single()

      if (summaryError) throw summaryError

      // Link highlights to summary
      const summaryHighlights = highlightsToShow.map((highlight) => ({
        daily_summary_id: summaryData.id,
        highlight_id: highlight.id,
      }))

      const { error: linkError } = await supabase
        .from('daily_summary_highlights')
        .insert(summaryHighlights)

      if (linkError) throw linkError

      // Mark highlights as reviewed for this month
      const monthsReviewed = highlightsToShow.map((highlight) => ({
        highlight_id: highlight.id,
        month_year: currentMonth,
      }))

      const { error: monthsError } = await supabase
        .from('highlight_months_reviewed')
        .upsert(monthsReviewed, { onConflict: 'highlight_id,month_year' })

      if (monthsError) throw monthsError

      // Update highlight resurface info
      for (const highlight of highlightsToShow) {
        await supabase
          .from('highlights')
          .update({
            last_resurfaced: selectedDate,
            resurface_count: (highlight.resurface_count || 0) + 1,
          })
          .eq('id', highlight.id)
      }
    } catch (error) {
      console.error('Error ensuring daily summary:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Daily Summary
            </h1>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
            >
              Home
            </Link>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
          </div>

          {summary ? (
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                {(() => {
                  // Parse date string (YYYY-MM-DD) as local date to avoid timezone offset
                  const [year, month, day] = summary.date.split('-').map(Number)
                  const localDate = new Date(year, month - 1, day)
                  return format(localDate, 'EEEE, MMMM d, yyyy')
                })()}
              </h2>
              {summary.highlights.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg text-center text-gray-500 dark:text-gray-400">
                  No highlights to resurface for this date.
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.highlights.map((summaryHighlight: DailySummaryHighlight) => {
                    const highlight = summaryHighlight.highlight
                    if (!highlight) return null

                    return (
                      <div
                        key={summaryHighlight.id}
                        id={`highlight-${highlight.id}`}
                        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg"
                      >
                        <div
                          className="text-gray-800 dark:text-gray-200 mb-3 text-lg prose dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: highlight.html_content || highlight.text,
                          }}
                        />
                        {highlight.categories && highlight.categories.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {highlight.categories.map((cat) => (
                              <span
                                key={cat.id}
                                className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                              >
                                {cat.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {highlight.linked_highlights && highlight.linked_highlights.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Linked to:</p>
                            <div className="flex flex-wrap gap-2">
                              {highlight.linked_highlights.map((link) => (
                                <a
                                  key={link.id}
                                  href={`#highlight-${link.to_highlight_id}`}
                                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    document.getElementById(`highlight-${link.to_highlight_id}`)?.scrollIntoView({ behavior: 'smooth' })
                                  }}
                                >
                                  {link.link_text || link.to_highlight?.text?.substring(0, 50) || 'Link'}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {(highlight.source || highlight.author) && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {highlight.author && <span>{highlight.author}</span>}
                            {highlight.author && highlight.source && <span> • </span>}
                            {highlight.source && <span>{highlight.source}</span>}
                          </p>
                        )}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex gap-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Rate this highlight:</span>
                            <button
                              onClick={() => handleRatingChange(summaryHighlight.id, highlight.id, 'low')}
                              className={`px-3 py-1 text-sm rounded transition ${
                                summaryHighlight.rating === 'low'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              Low
                            </button>
                            <button
                              onClick={() => handleRatingChange(summaryHighlight.id, highlight.id, 'med')}
                              className={`px-3 py-1 text-sm rounded transition ${
                                summaryHighlight.rating === 'med'
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              Med
                            </button>
                            <button
                              onClick={() => handleRatingChange(summaryHighlight.id, highlight.id, 'high')}
                              className={`px-3 py-1 text-sm rounded transition ${
                                summaryHighlight.rating === 'high'
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              High
                            </button>
                            {summaryHighlight.rating && (
                              <button
                                onClick={() => handleRatingChange(summaryHighlight.id, highlight.id, null)}
                                className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          {highlight.average_rating !== undefined && highlight.average_rating > 0 && (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              Avg: {highlight.average_rating.toFixed(1)} ({highlight.rating_count} ratings)
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg text-center text-gray-500 dark:text-gray-400">
              No summary available for this date.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
