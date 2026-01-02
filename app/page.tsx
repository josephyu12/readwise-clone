import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Readwise Clone
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Resurface your highlights in daily summaries
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Link
              href="/highlights"
              className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow"
            >
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Manage Highlights
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Add, edit, and organize your highlights
              </p>
            </Link>
            
            <Link
              href="/import"
              className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow"
            >
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Import from Notion
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Import highlights from a Notion page
              </p>
            </Link>
            
            <Link
              href="/daily"
              className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow"
            >
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Daily Summaries
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                View your resurfaced highlights
              </p>
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

