'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Highlight, Category } from '@/types/database'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'
import RichTextEditor from '@/components/RichTextEditor'

export default function SearchPage() {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<'fulltext' | 'semantic'>('fulltext')
  const [results, setResults] = useState<Highlight[]>([])
  const [similarResults, setSimilarResults] = useState<Highlight[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editHtmlContent, setEditHtmlContent] = useState('')
  const [editSource, setEditSource] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editCategories, setEditCategories] = useState<string[]>([])
  const [updatingNotion, setUpdatingNotion] = useState(false)
  const [linkingMode, setLinkingMode] = useState(false)
  const [selectedLinkText, setSelectedLinkText] = useState('')
  const [linkSearchQuery, setLinkSearchQuery] = useState('')
  const [linkSearchResults, setLinkSearchResults] = useState<Highlight[]>([])
  const [showLinkSearch, setShowLinkSearch] = useState(false)

  const debouncedQuery = useDebounce(query, 500)
  const debouncedLinkSearchQuery = useDebounce(linkSearchQuery, 300)

  useEffect(() => {
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (showLinkSearch && linkingMode) {
      performLinkSearch(debouncedLinkSearchQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLinkSearchQuery, showLinkSearch, linkingMode])

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

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
    if (editingId) return // Don't change selection while editing
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

  const handleStartEdit = (highlight: Highlight) => {
    setEditingId(highlight.id)
    setEditText(highlight.text)
    setEditHtmlContent(highlight.html_content || highlight.text)
    setEditSource(highlight.source || '')
    setEditAuthor(highlight.author || '')
    setEditCategories(highlight.categories?.map((c) => c.id) || [])
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditText('')
    setEditHtmlContent('')
    setEditSource('')
    setEditAuthor('')
    setEditCategories([])
    setLinkingMode(false)
    setSelectedLinkText('')
    setLinkSearchQuery('')
    setLinkSearchResults([])
    setShowLinkSearch(false)
  }

  const handleStartLinking = () => {
    setLinkingMode(true)
    setShowLinkSearch(false)
    setSelectedLinkText('')
    setLinkSearchQuery('')
    setLinkSearchResults([])
  }

  const handleTextSelectionInEditor = () => {
    if (!linkingMode) return

    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim()
      setSelectedLinkText(selectedText)
      setShowLinkSearch(true)
      // Trigger search for highlights
      performLinkSearch('')
    }
  }

  const performLinkSearch = async (query: string) => {
    if (!query.trim()) {
      // If empty query, show recent highlights (excluding the one being edited)
      try {
        const { data, error } = await supabase
          .from('highlights')
          .select('*')
          .neq('id', editingId || '')
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) throw error
        setLinkSearchResults(data || [])
      } catch (error) {
        console.error('Error loading highlights for linking:', error)
        setLinkSearchResults([])
      }
      return
    }

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          type: 'fulltext',
        }),
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      // Filter out the highlight being edited
      const filteredResults = (data.results || []).filter((h: Highlight) => h.id !== editingId)
      setLinkSearchResults(filteredResults)
    } catch (error) {
      console.error('Error searching highlights for linking:', error)
      setLinkSearchResults([])
    }
  }

  const handleCreateLink = async (targetHighlightId: string) => {
    if (!editingId || !selectedLinkText) return

    try {
      const { error } = await supabase
        .from('highlight_links')
        .insert([
          {
            from_highlight_id: editingId,
            to_highlight_id: targetHighlightId,
            link_text: selectedLinkText,
          },
        ])

      if (error) throw error

      // Update local state to show the link
      const targetHighlight = linkSearchResults.find(h => h.id === targetHighlightId)
      if (targetHighlight && editingId) {
        const newLink = {
          id: `temp-${Date.now()}`,
          from_highlight_id: editingId,
          to_highlight_id: targetHighlightId,
          link_text: selectedLinkText,
          to_highlight: targetHighlight,
        }
        // Update the highlight in results/similarResults to include the new link
        setResults(prevResults =>
          prevResults.map(h => {
            if (h.id === editingId) {
              return {
                ...h,
                linked_highlights: [
                  ...(h.linked_highlights || []),
                  newLink,
                ],
              }
            }
            return h
          })
        )
        setSimilarResults(prevResults =>
          prevResults.map(h => {
            if (h.id === editingId) {
              return {
                ...h,
                linked_highlights: [
                  ...(h.linked_highlights || []),
                  newLink,
                ],
              }
            }
            return h
          })
        )
      }

      // Reset linking state
      setLinkingMode(false)
      setSelectedLinkText('')
      setLinkSearchQuery('')
      setLinkSearchResults([])
      setShowLinkSearch(false)
    } catch (error) {
      console.error('Error creating link:', error)
      alert('Failed to create link. Please try again.')
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId) return

    try {
      setUpdatingNotion(true)

      const updateData: any = {
        text: editText.trim(),
        html_content: editHtmlContent && editHtmlContent.trim() ? editHtmlContent.trim() : null,
        source: editSource && editSource.trim() ? editSource.trim() : null,
        author: editAuthor && editAuthor.trim() ? editAuthor.trim() : null,
      }

      const { error: updateError, data: updatedData } = await supabase
        .from('highlights')
        .update(updateData)
        .eq('id', editingId)
        .select(`
          *,
          highlight_categories (
            category:categories (*)
          )
        `)
        .single()

      if (updateError) throw updateError

      if (!updatedData) {
        throw new Error('Update returned no data')
      }

      // Update categories
      await supabase
        .from('highlight_categories')
        .delete()
        .eq('highlight_id', editingId)

      if (editCategories.length > 0) {
        const categoryLinks = editCategories.map((catId) => ({
          highlight_id: editingId,
          category_id: catId,
        }))
        await supabase.from('highlight_categories').insert(categoryLinks)
      }

      // Queue Notion sync
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (currentUser) {
          const originalHighlight = [...results, ...similarResults].find(h => h.id === editingId)
          
          await supabase
            .from('notion_sync_queue')
            .insert([{
              user_id: currentUser.id,
              highlight_id: editingId,
              operation_type: 'update',
              text: editText.trim(),
              html_content: editHtmlContent.trim(),
              original_text: originalHighlight?.text || '',
              original_html_content: originalHighlight?.html_content || '',
              status: 'pending',
            }])
          
          fetch('/api/notion/sync', { method: 'POST' }).catch(() => {})
        }
      } catch (notionError) {
        console.warn('Failed to queue Notion sync:', notionError)
      }

      // Update local state
      const processedUpdatedData = {
        ...updatedData,
        categories: updatedData.highlight_categories?.map((hc: any) => hc.category) || 
                    categories.filter(c => editCategories.includes(c.id)),
      }

      setResults(prevResults => 
        prevResults.map(h => h.id === editingId ? processedUpdatedData : h)
      )
      setSimilarResults(prevResults => 
        prevResults.map(h => h.id === editingId ? processedUpdatedData : h)
      )

      handleCancelEdit()
    } catch (error: any) {
      console.error('Error updating highlight:', error)
      alert(error?.message || 'Failed to update highlight. Please try again.')
    } finally {
      setUpdatingNotion(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this highlight?')) return

    try {
      // Get current user for Notion sync queue
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const highlightToDelete = [...results, ...similarResults].find(h => h.id === id)
        
        // Queue Notion deletion
        try {
          await supabase
            .from('notion_sync_queue')
            .insert([{
              user_id: user.id,
              highlight_id: id,
              operation_type: 'delete',
              text: highlightToDelete?.text || '',
              html_content: highlightToDelete?.html_content || '',
              original_text: highlightToDelete?.text || '',
              original_html_content: highlightToDelete?.html_content || '',
              status: 'pending',
            }])
          
          fetch('/api/notion/sync', { method: 'POST' }).catch(() => {})
        } catch (notionError) {
          console.warn('Failed to queue Notion sync:', notionError)
        }
      }

      const { error } = await supabase
        .from('highlights')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Update local state
      setResults(prevResults => prevResults.filter((h) => h.id !== id))
      setSimilarResults(prevResults => prevResults.filter((h) => h.id !== id))
      
      if (selectedHighlight?.id === id) {
        setSelectedHighlight(null)
        setSimilarResults([])
      }
    } catch (error) {
      console.error('Error deleting highlight:', error)
      alert('Failed to delete highlight. Please try again.')
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
                    className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transition ${
                      selectedHighlight?.id === highlight.id && !editingId
                        ? 'ring-2 ring-blue-500'
                        : 'hover:shadow-xl'
                    }`}
                  >
                    {editingId === highlight.id ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Highlight Text *
                          </label>
                          <RichTextEditor
                            value={editText}
                            htmlValue={editHtmlContent}
                            onChange={(plainText, html) => {
                              setEditText(plainText)
                              setEditHtmlContent(html)
                            }}
                            placeholder="Enter your highlight..."
                          />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Source (optional)
                            </label>
                            <input
                              type="text"
                              value={editSource}
                              onChange={(e) => setEditSource(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                              placeholder="Book, article, etc."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Author (optional)
                            </label>
                            <input
                              type="text"
                              value={editAuthor}
                              onChange={(e) => setEditAuthor(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                              placeholder="Author name"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Categories
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {categories.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  if (editCategories.includes(cat.id)) {
                                    setEditCategories(editCategories.filter((id) => id !== cat.id))
                                  } else {
                                    setEditCategories([...editCategories, cat.id])
                                  }
                                }}
                                className={`px-3 py-1 text-sm rounded-full transition ${
                                  editCategories.includes(cat.id)
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                }`}
                              >
                                {cat.name}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={updatingNotion}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {updatingNotion ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={updatingNotion}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          onClick={() => handleHighlightClick(highlight)}
                          className="cursor-pointer"
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
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartEdit(highlight)
                            }}
                            className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(highlight.id)
                            }}
                            className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </>
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
                    {editingId === highlight.id ? (
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Highlight Text *
                            </label>
                            <button
                              type="button"
                              onClick={handleStartLinking}
                              className={`px-3 py-1 text-xs rounded transition ${
                                linkingMode
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              {linkingMode ? 'Linking... (Select text)' : 'Link Text'}
                            </button>
                          </div>
                          <div className="relative">
                            <div
                              onMouseUp={handleTextSelectionInEditor}
                              className={linkingMode ? 'cursor-text' : ''}
                            >
                              <RichTextEditor
                                value={editText}
                                htmlValue={editHtmlContent}
                                onChange={(plainText, html) => {
                                  setEditText(plainText)
                                  setEditHtmlContent(html)
                                }}
                                placeholder="Enter your highlight..."
                              />
                            </div>
                            {showLinkSearch && selectedLinkText && (
                              <div className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    Link &quot;{selectedLinkText.substring(0, 30)}{selectedLinkText.length > 30 ? '...' : ''}&quot; to:
                                  </p>
                                  <input
                                    type="text"
                                    value={linkSearchQuery}
                                    onChange={(e) => setLinkSearchQuery(e.target.value)}
                                    placeholder="Search highlights..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-sm"
                                    autoFocus
                                  />
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {linkSearchResults.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                      {linkSearchQuery ? 'No highlights found' : 'Start typing to search...'}
                                    </div>
                                  ) : (
                                    linkSearchResults.map((targetHighlight) => (
                                      <button
                                        key={targetHighlight.id}
                                        onClick={() => handleCreateLink(targetHighlight.id)}
                                        className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition"
                                      >
                                        <div
                                          className="text-sm prose dark:prose-invert max-w-none line-clamp-2"
                                          dangerouslySetInnerHTML={{
                                            __html: targetHighlight.html_content || targetHighlight.text,
                                          }}
                                        />
                                        {(targetHighlight.source || targetHighlight.author) && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {targetHighlight.author && <span>{targetHighlight.author}</span>}
                                            {targetHighlight.author && targetHighlight.source && <span> • </span>}
                                            {targetHighlight.source && <span>{targetHighlight.source}</span>}
                                          </p>
                                        )}
                                      </button>
                                    ))
                                  )}
                                </div>
                                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                                  <button
                                    onClick={() => {
                                      setLinkingMode(false)
                                      setShowLinkSearch(false)
                                      setSelectedLinkText('')
                                      setLinkSearchQuery('')
                                    }}
                                    className="w-full px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Source (optional)
                            </label>
                            <input
                              type="text"
                              value={editSource}
                              onChange={(e) => setEditSource(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                              placeholder="Book, article, etc."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Author (optional)
                            </label>
                            <input
                              type="text"
                              value={editAuthor}
                              onChange={(e) => setEditAuthor(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                              placeholder="Author name"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Categories
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {categories.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  if (editCategories.includes(cat.id)) {
                                    setEditCategories(editCategories.filter((id) => id !== cat.id))
                                  } else {
                                    setEditCategories([...editCategories, cat.id])
                                  }
                                }}
                                className={`px-3 py-1 text-sm rounded-full transition ${
                                  editCategories.includes(cat.id)
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                }`}
                              >
                                {cat.name}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={updatingNotion}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {updatingNotion ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={updatingNotion}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
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
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartEdit(highlight)
                            }}
                            className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(highlight.id)
                            }}
                            className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </>
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

