export interface Category {
  id: string
  name: string
  color?: string
  created_at: string
}

export interface HighlightMonthReviewed {
  id: string
  highlight_id: string
  month_year: string // Format: "YYYY-MM" e.g., "2026-01"
  created_at: string
}

export interface Highlight {
  id: string
  text: string
  html_content?: string
  source?: string
  author?: string
  created_at: string
  last_resurfaced?: string
  resurface_count: number
  average_rating?: number
  rating_count?: number
  archived?: boolean
  categories?: Category[]
  linked_highlights?: HighlightLink[]
  months_reviewed?: HighlightMonthReviewed[]
}

export interface HighlightLink {
  id: string
  from_highlight_id: string
  to_highlight_id: string
  link_text?: string
  to_highlight?: Highlight
}

export interface DailySummaryHighlight {
  id: string
  daily_summary_id: string
  highlight_id: string
  rating?: 'low' | 'med' | 'high'
  highlight?: Highlight
}

export interface DailySummary {
  id: string
  date: string
  highlights: DailySummaryHighlight[]
  created_at: string
}

