'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Highlight, Category } from '@/types/database'
import Link from 'next/link'
import RichTextEditor from '@/components/RichTextEditor'

export default function HighlightsPage() {
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
  const [linkingMode, setLinkingMode] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    loadHighlights()
    loadCategories()
  }, [showArchived])

  const loadHighlights = async () => {
    try {
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

      const { data, error } = await query.order('created_at', { ascending: false })

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
      const { data, error } = await supabase
        .from('categories')
        .insert([{ name: newCategoryName.trim() }])
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

      await loadHighlights()
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

      setHighlights(highlights.filter((h) => h.id !== id))
    } catch (error) {
      console.error('Error deleting highlight:', error)
    }
  }

  const handleCreateLink = async (fromId: string, toId: string, linkText: string) => {
    try {
      const { error } = await supabase
        .from('highlight_links')
        .insert([
          {
            from_highlight_id: fromId,
            to_highlight_id: toId,
            link_text: linkText,
          },
        ])

      if (error) throw error
      await loadHighlights()
      setLinkingMode(false)
      setSelectedText('')
      setLinkTargetId(null)
    } catch (error) {
      console.error('Error creating link:', error)
    }
  }

  const handleTextSelection = (highlightId: string) => {
    if (!linkingMode) return

    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString())
      setLinkTargetId(highlightId)
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
                href="/import"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                Import from Notion
              </Link>
              <button
                onClick={() => setLinkingMode(!linkingMode)}
                className={`px-4 py-2 rounded-lg transition ${
                  linkingMode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {linkingMode ? 'Cancel Linking' : 'Link Highlights'}
              </button>
              <Link
                href="/"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Home
              </Link>
            </div>
          </div>

          {linkingMode && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Linking mode: Select text in a highlight, then click another highlight to create a link.
              </p>
            </div>
          )}

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
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              All Highlights ({highlights.length})
            </h2>
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
                  onMouseUp={() => handleTextSelection(highlight.id)}
                >
                  {highlight.archived && (
                    <div className="mb-2 px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded text-xs font-semibold inline-block">
                      Archived (marked low twice)
                    </div>
                  )}
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
                      {linkingMode && selectedText && linkTargetId !== highlight.id && (
                        <button
                          onClick={() => handleCreateLink(linkTargetId!, highlight.id, selectedText)}
                          className="px-3 py-1 text-sm bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 transition"
                        >
                          Link to &quot;{selectedText.substring(0, 20)}...&quot;
                        </button>
                      )}
                      {highlight.archived && (
                        <button
                          onClick={async () => {
                            try {
                              await supabase
                                .from('highlights')
                                .update({ archived: false })
                                .eq('id', highlight.id)
                              await loadHighlights()
                            } catch (error) {
                              console.error('Error unarchiving highlight:', error)
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
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
