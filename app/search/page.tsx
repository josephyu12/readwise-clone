'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Highlight } from '@/types/database'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<'fulltext' | 'semantic'>('fulltext')
  const [results, setResults] = useState<Highlight[]>([])
  const [similarResults, setSimilarResults] = useState<Highlight[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(null)

  const debouncedQuery = useDebounce(query, 500)

  const performSearch = useCallback(async (searchQuery: string, type: 'fulltext' | 'semantic') => {
    if (!searchQuery.trim()) {
      setResults([])
      setSimilarResults([])
      setSelectedHighlight(null)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
          type,
        }),
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.results || [])
      setSimilarResults(data.similar || [])
      
      // If we have results, select the first one to show similar highlights
      if (data.results && data.results.length > 0) {
        setSelectedHighlight(data.results[0])
      } else {
        setSelectedHighlight(null)
      }
    } catch (error) {
      console.error('Error performing search:', error)
      setResults([])
      setSimilarResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery, searchType)
    } else {
      setResults([])
      setSimilarResults([])
      setSelectedHighlight(null)
    }
  }, [debouncedQuery, searchType, performSearch])

  const handleHighlightClick = async (highlight: Highlight) => {
    setSelectedHighlight(highlight)
    
    // Fetch similar highlights for the selected one
    if (highlight.id) {
      try {
        const response = await fetch('/api/search/similar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            highlightId: highlight.id,
            text: highlight.text,
            htmlContent: highlight.html_content,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setSimilarResults(data.similar || [])
        }
      } catch (error) {
        console.error('Error fetching similar highlights:', error)
      }
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Search Highlights
            </h1>
            <Link
              href="/highlights"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
            >
              Back to Highlights
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search highlights..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-lg"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSearchType('fulltext')}
                  className={`px-4 py-3 rounded-lg transition ${
                    searchType === 'fulltext'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Full Text
                </button>
                <button
                  onClick={() => setSearchType('semantic')}
                  className={`px-4 py-3 rounded-lg transition ${
                    searchType === 'semantic'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Semantic
                </button>
              </div>
            </div>
            {query && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {loading ? (
                  <span>Searching...</span>
                ) : (
                  <span>
                    Found {results.length} result{results.length !== 1 ? 's' : ''}
                    {similarResults.length > 0 && `, ${similarResults.length} similar`}
                  </span>
                )}
              </div>
            )}
          </div>

          {query && !loading && results.length === 0 && similarResults.length === 0 && (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg text-center text-gray-500 dark:text-gray-400">
              No results found. Try different keywords or switch to semantic search.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Search Results */}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Search Results
              </h2>
              <div className="space-y-4">
                {results.map((highlight) => (
                  <div
                    key={highlight.id}
                    onClick={() => handleHighlightClick(highlight)}
                    className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg cursor-pointer transition ${
                      selectedHighlight?.id === highlight.id
                        ? 'ring-2 ring-blue-500'
                        : 'hover:shadow-xl'
                    }`}
                  >
                    <div
                      className="highlight-content text-base mb-3 prose dark:prose-invert max-w-none"
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
                    {(highlight.source || highlight.author) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {highlight.author && <span>{highlight.author}</span>}
                        {highlight.author && highlight.source && <span> • </span>}
                        {highlight.source && <span>{highlight.source}</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Similar Highlights */}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                {selectedHighlight ? 'Similar Highlights' : 'Select a highlight to see similar ones'}
              </h2>
              {selectedHighlight && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-2">
                    Finding highlights similar to:
                  </p>
                  <div
                    className="highlight-content text-sm prose dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: selectedHighlight.html_content || selectedHighlight.text,
                    }}
                  />
                </div>
              )}
              <div className="space-y-4">
                {similarResults.map((highlight) => (
                  <div
                    key={highlight.id}
                    className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg hover:shadow-xl transition"
                  >
                    <div
                      className="highlight-content text-base mb-3 prose dark:prose-invert max-w-none"
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
                    {(highlight.source || highlight.author) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {highlight.author && <span>{highlight.author}</span>}
                        {highlight.author && highlight.source && <span> • </span>}
                        {highlight.source && <span>{highlight.source}</span>}
                      </p>
                    )}
                  </div>
                ))}
                {selectedHighlight && similarResults.length === 0 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No similar highlights found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

