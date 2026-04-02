'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="th">
      <body className="bg-white dark:bg-zinc-950 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">เกิดข้อผิดพลาด</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {error.message || 'ระบบเกิดข้อผิดพลาด กรุณารีเฟรชหน้าเว็บ'}
          </p>
          {error.digest && (
            <p className="text-xs text-zinc-400">Error ID: {error.digest}</p>
          )}
          <button
            onClick={unstable_retry}
            className="text-sm px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  )
}
