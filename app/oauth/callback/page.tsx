'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { submitAnthropicOAuth } from '@/lib/api'

export default function OAuthCallbackPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code) {
      setStatus('error')
      setErrorMsg('ไม่พบ authorization code — กรุณาลองใหม่')
      return
    }

    // ส่ง URL ทั้งหมดไปให้ openclaw-api แปลง
    const currentUrl = window.location.href
    submitAnthropicOAuth(currentUrl)
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/model'), 2000)
      })
      .catch((e: unknown) => {
        const err = e as { response?: { data?: { error?: string } }; message?: string }
        setStatus('error')
        setErrorMsg(err?.response?.data?.error || err?.message || 'เกิดข้อผิดพลาด')
      })
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        {status === 'processing' && (
          <>
            <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">กำลังเชื่อมต่อ Anthropic Account...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-4xl">✅</div>
            <p className="font-semibold text-green-600">เชื่อมต่อสำเร็จ</p>
            <p className="text-sm text-zinc-500">กำลังกลับไปหน้า Model...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl">❌</div>
            <p className="font-semibold text-red-600">เชื่อมต่อไม่สำเร็จ</p>
            <p className="text-sm text-zinc-500">{errorMsg}</p>
            <button
              onClick={() => router.push('/model')}
              className="text-sm text-blue-600 underline"
            >
              กลับไปหน้า Model
            </button>
          </>
        )}
      </div>
    </div>
  )
}
