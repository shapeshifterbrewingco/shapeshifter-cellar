'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        <h1 className="text-lg font-bold text-gray-900">That did not load</h1>
        <p className="text-sm text-gray-500 mt-2">
          Nothing has been lost. This is usually a dropped connection. Try again, and if it keeps
          happening tell James and quote the reference below.
        </p>
        {error.digest && <p className="text-xs text-gray-400 mt-3 font-mono">Ref {error.digest}</p>}
        <button
          onClick={() => unstable_retry()}
          className="mt-5 h-11 px-6 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
