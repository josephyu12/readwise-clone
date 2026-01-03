'use client'

import { useEffect, useRef, useState } from 'react'

export default function NotionSyncProcessor() {
  const [isOnline, setIsOnline] = useState(true)
  const isProcessingRef = useRef(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      processQueue()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial run
    processQueue()

    const interval = setInterval(() => {
      if (navigator.onLine) {
        processQueue()
      }
    }, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, []) // 👈 runs once

  const processQueue = async () => {
    if (isProcessingRef.current || !navigator.onLine) return

    isProcessingRef.current = true

    try {
      const response = await fetch('/api/notion/sync', {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.processed > 0) {
          console.log(`Processed ${data.processed} Notion sync items`)
        }
      }
    } catch (err) {
      console.warn('Failed to process Notion sync queue:', err)
    } finally {
      isProcessingRef.current = false
    }
  }

  return null
}
