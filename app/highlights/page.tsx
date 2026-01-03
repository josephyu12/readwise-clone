'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Highlight, Category } from '@/types/database'
import Link from 'next/link'
import RichTextEditor from '@/components/RichTextEditor'
import { useDebounce } from '@/hooks/useDebounce'

export default function HighlightsPage() {
  const supabase = createClient()
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [source, setSource] = useState('')
  const [author, setAuthor] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [totalHighlights, setTotalHighlights] = useState(0)
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

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filter changes
  }, [showArchived])

  useEffect(() => {
    loadHighlights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, currentPage, itemsPerPage])

  const loadHighlights = async () => {
    try {
      setLoading(true)
      
      // First, get the total count
      let countQuery = supabase
        .from('highlights')
        .select('*', { count: 'exact', head: true })

      if (showArchived) {
        countQuery = countQuery.eq('archived', true)
      } else {
        countQuery = countQuery.eq('archived', false)
      }

      const { count, error: countError } = await countQuery
      if (countError) throw countError
      setTotalHighlights(count || 0)

      // Then get the paginated data
      let query = supabase
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
          ),
          months_reviewed:highlight_months_reviewed (
            id,
            month_year,
            created_at
          )
        `)

      // Filter by archived status
      if (showArchived) {
        query = query.eq('archived', true)
      } else {
        query = query.eq('archived', false)
      }

      // Apply pagination
      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      const processedHighlights = (data || []).map((h: any) => ({
        ...h,
        categories: h.highlight_categories?.map((hc: any) => hc.category) || [],
        linked_highlights: h.highlight_links_from || [],
        months_reviewed: h.months_reviewed || [],
      }))

      setHighlights(processedHighlights)
    } catch (error) {
      console.error('Error loading highlights:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(totalHighlights / itemsPerPage)

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

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('categories')
        .insert([{ name: newCategoryName.trim(), user_id: user.id }])
        .select()
        .single()

      if (error) throw error

      setCategories([...categories, data])
      setSelectedCategories([...selectedCategories, data.id])
      setNewCategoryName('')
      setShowCategoryInput(false)
    } catch (error) {
      console.error('Error creating category:', error)
      alert('Failed to create category. It may already exist.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('highlights')
        .insert([
          {
            text: text.trim(),
            html_content: htmlContent || null,
            source: source.trim() || null,
            author: author.trim() || null,
            resurface_count: 0,
            average_rating: 0,
            rating_count: 0,
            user_id: user.id,
          },
        ])
        .select()
        .single()

      if (error) throw error

      // Add categories
      if (selectedCategories.length > 0) {
        const categoryLinks = selectedCategories.map((catId) => ({
          highlight_id: data.id,
          category_id: catId,
        }))

        await supabase.from('highlight_categories').insert(categoryLinks)
      }

      // Add categories to the new highlight data
      const categoryData = selectedCategories.length > 0
        ? categories.filter(c => selectedCategories.includes(c.id))
        : []

      // Add the new highlight to local state instead of reloading everything
      const newHighlight: Highlight = {
        ...data,
        categories: categoryData,
        linked_highlights: [],
        months_reviewed: [],
      }
      
      setHighlights(prevHighlights => [newHighlight, ...prevHighlights])
      setTotalHighlights(prev => prev + 1)

      // Queue Notion sync in background (non-blocking)
      try {
        await supabase
          .from('notion_sync_queue')
          .insert([{
            user_id: user.id,
            highlight_id: data.id,
            operation_type: 'add',
            text: text.trim(),
            html_content: htmlContent || null,
            status: 'pending',
          }])
        
        // Trigger background processing (don't wait for it)
        fetch('/api/notion/sync', { method: 'POST' }).catch(() => {
          // Silently fail - queue processor will handle it
        })
      } catch (notionError) {
        console.warn('Failed to queue Notion sync:', notionError)
        // Continue - database insert succeeded
      }

      setText('')
      setHtmlContent('')
      setSource('')
      setAuthor('')
      setSelectedCategories([])
    } catch (error) {
      console.error('Error adding highlight:', error)
      alert('Failed to add highlight. Please check your Supabase configuration.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this highlight?')) return

    try {
      const { error } = await supabase
        .from('highlights')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Update local state directly
      setHighlights(prevHighlights => prevHighlights.filter((h) => h.id !== id))
      setTotalHighlights(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error deleting highlight:', error)
      // Reload on error to ensure consistency
      await loadHighlights()
    }
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

      // Reload highlights to get updated link data (links require complex joins)
      await loadHighlights()
      
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

  const handleStartEdit = (highlight: Highlight) => {
    setEditingId(highlight.id)
    setEditText(highlight.text)
    setEditHtmlContent(highlight.html_content || highlight.text)
    setEditSource(highlight.source || '')
    setEditAuthor(highlight.author || '')
    setEditCategories(highlight.categories?.map((c) => c.id) || [])
    setLinkingMode(false)
    setSelectedLinkText('')
    setLinkSearchQuery('')
    setLinkSearchResults([])
    setShowLinkSearch(false)
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

  const handleSaveEdit = async () => {
    if (!editingId) return

    try {
      setUpdatingNotion(true)

      // Prepare update data - handle empty strings properly
      // Use explicit null checks to ensure empty strings are handled correctly
      const updateData: any = {
        text: editText.trim(),
        html_content: editHtmlContent && editHtmlContent.trim() ? editHtmlContent.trim() : null,
        source: editSource && editSource.trim() ? editSource.trim() : null,
        author: editAuthor && editAuthor.trim() ? editAuthor.trim() : null,
      }

      console.log('Updating highlight:', editingId, 'with data:', updateData)

      // Update in database - use select to get the updated row back
      const { error: updateError, data: updatedData } = await supabase
        .from('highlights')
        .update(updateData)
        .eq('id', editingId)
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
          ),
          months_reviewed:highlight_months_reviewed (
            id,
            month_year,
            created_at
          )
        `)
        .single()

      if (updateError) {
        console.error('Update error details:', {
          error: updateError,
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        })
        throw updateError
      }

      // Verify the update actually happened
      if (!updatedData) {
        console.error('Update returned no data for highlight:', editingId)
        throw new Error('Update returned no data - RLS policy may be blocking the update')
      }

      console.log('Update successful, returned data:', updatedData)

      // Update categories
      // First, remove existing categories
      await supabase
        .from('highlight_categories')
        .delete()
        .eq('highlight_id', editingId)

      // Then add new ones
      if (editCategories.length > 0) {
        const categoryLinks = editCategories.map((catId) => ({
          highlight_id: editingId,
          category_id: catId,
        }))
        await supabase.from('highlight_categories').insert(categoryLinks)
      }

      // Queue Notion sync in background (non-blocking)
      try {
        // Get current user
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (currentUser) {
          // Get the original highlight to store original text for Notion matching
          const originalHighlight = highlights.find(h => h.id === editingId)
          
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
          
          // Trigger background processing (don't wait for it)
          fetch('/api/notion/sync', { method: 'POST' }).catch(() => {
            // Silently fail - queue processor will handle it
          })
        }
      } catch (notionError) {
        console.warn('Failed to queue Notion sync:', notionError)
        // Continue - database update succeeded
      }

      // Process the updated data to match the format expected by the UI
      const processedUpdatedData = {
        ...updatedData,
        categories: updatedData.highlight_categories?.map((hc: any) => hc.category) || 
                    categories.filter(c => editCategories.includes(c.id)),
        linked_highlights: updatedData.highlight_links_from || [],
        months_reviewed: updatedData.months_reviewed || [],
      }

      // Update local state directly instead of reloading everything
      // Use the data returned from Supabase to ensure consistency
      setHighlights(prevHighlights => 
        prevHighlights.map(h => {
          if (h.id === editingId) {
            return processedUpdatedData
          }
          return h
        })
      )

      handleCancelEdit()
    } catch (error: any) {
      console.error('Error updating highlight:', error)
      const errorMessage = error?.message || 'Failed to update highlight. Please try again.'
      alert(errorMessage)
      // Reload on error to ensure consistency
      await loadHighlights()
    } finally {
      setUpdatingNotion(false)
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
              {showArchived ? 'Archived Highlights' : 'My Highlights'}
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`px-4 py-2 rounded-lg transition ${
                  showArchived
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {showArchived ? 'Show Active' : 'Show Archived'}
              </button>
              <Link
                href="/search"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Search
              </Link>
              <Link
                href="/import"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                Import from Notion
              </Link>
              <Link
                href="/settings"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Settings
              </Link>
              <Link
                href="/"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Home
              </Link>
            </div>
          </div>


          <form onSubmit={handleSubmit} className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Add New Highlight
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Highlight Text *
                </label>
                <RichTextEditor
                  value={text}
                  htmlValue={htmlContent}
                  onChange={(newText, newHtml) => {
                    setText(newText)
                    setHtmlContent(newHtml)
                  }}
                  placeholder="Enter your highlight with formatting..."
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Source (optional)
                  </label>
                  <input
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
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
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Author name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categories
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        if (selectedCategories.includes(cat.id)) {
                          setSelectedCategories(selectedCategories.filter((id) => id !== cat.id))
                        } else {
                          setSelectedCategories([...selectedCategories, cat.id])
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-sm transition ${
                        selectedCategories.includes(cat.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                  {!showCategoryInput ? (
                    <button
                      type="button"
                      onClick={() => setShowCategoryInput(true)}
                      className="px-3 py-1 rounded-full text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                    >
                      + New Category
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateCategory()
                          }
                        }}
                        className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-full text-sm dark:bg-gray-700 dark:text-white"
                        placeholder="Category name"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 transition"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCategoryInput(false)
                          setNewCategoryName('')
                        }}
                        className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="submit"
                className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Add Highlight
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                All Highlights ({totalHighlights})
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">
                  Show:
                </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  per page
                </span>
              </div>
            </div>
            {highlights.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg text-center text-gray-500 dark:text-gray-400">
                No highlights yet. Add your first highlight above!
              </div>
            ) : (
              highlights.map((highlight) => (
                <div
                  key={highlight.id}
                  id={`highlight-${highlight.id}`}
                  className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg ${
                    highlight.archived ? 'opacity-60 border-2 border-orange-300 dark:border-orange-700' : ''
                  }`}
                >
                  {highlight.archived && (
                    <div className="mb-2 px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded text-xs font-semibold inline-block">
                      Archived (marked low twice)
                    </div>
                  )}
                  {editingId === highlight.id ? (
                    <div className="mb-4 space-y-4">
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
                    <div
                      className="highlight-content text-base mb-3 prose dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: highlight.html_content || highlight.text,
                      }}
                    />
                  )}
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {highlight.author && <span>{highlight.author}</span>}
                      {highlight.author && highlight.source && <span> • </span>}
                      {highlight.source && <span>{highlight.source}</span>}
                    </p>
                  )}
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      <div>
                        Resurfaced {highlight.resurface_count} time{highlight.resurface_count !== 1 ? 's' : ''}
                        {highlight.last_resurfaced && (
                          <span> • Last: {new Date(highlight.last_resurfaced).toLocaleDateString()}</span>
                        )}
                        {highlight.average_rating !== undefined && highlight.average_rating > 0 && (
                          <span> • Avg Rating: {highlight.average_rating.toFixed(1)}</span>
                        )}
                      </div>
                      {highlight.months_reviewed && highlight.months_reviewed.length > 0 && (
                        <div className="mt-1">
                          Months reviewed: {highlight.months_reviewed
                            .map((mr: any) => {
                              const [year, month] = mr.month_year.split('-')
                              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                              return `${monthNames[parseInt(month) - 1]} ${year}`
                            })
                            .join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {editingId !== highlight.id && (
                        <>
                          <button
                            onClick={() => handleStartEdit(highlight)}
                            className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                          >
                            Edit
                          </button>
                          {highlight.archived && (
                            <button
                              onClick={async () => {
                                try {
                                  await supabase
                                    .from('highlights')
                                    .update({ archived: false })
                                    .eq('id', highlight.id)
                                  
                                  // Update local state directly
                                  setHighlights(prevHighlights =>
                                    prevHighlights.map(h =>
                                      h.id === highlight.id ? { ...h, archived: false } : h
                                    )
                                  )
                                } catch (error) {
                                  console.error('Error unarchiving highlight:', error)
                                  // Reload on error
                                  await loadHighlights()
                                }
                              }}
                              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                            >
                              Unarchive
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(highlight.id)}
                            className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalHighlights)} of {totalHighlights} highlights
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
