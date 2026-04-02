'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[admin-error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">เกิดข้อผิดพลาด</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
        {error.message || 'ไม่สามารถโหลดหน้านี้ได้ กรุณาลองใหม่อีกครั้ง'}
      </p>
      {error.digest && (
        <p className="text-xs text-zinc-400 dark:text-zinc-600">Error ID: {error.digest}</p>
      )}
      <Button variant="outline" size="sm" onClick={unstable_retry}>
        ลองใหม่
      </Button>
    </div>
  )
}
