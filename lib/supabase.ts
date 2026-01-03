// This file is kept for backward compatibility
// New code should use @/lib/supabase/client for client components
// and @/lib/supabase/server for server components
import { createClient as createBrowserClient } from '@/lib/supabase/client'

export const supabase = createBrowserClient()

