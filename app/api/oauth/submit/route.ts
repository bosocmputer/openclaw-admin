import { type NextRequest, NextResponse } from 'next/server'

// Public endpoint — ไม่ต้อง session (ใช้สำหรับ OAuth callback)
// รับ redirectUrl จาก /callback page แล้วส่งไป openclaw-api
export async function POST(req: NextRequest) {
  const API_URL   = process.env.API_URL
  const API_TOKEN = process.env.API_TOKEN
  if (!API_URL || !API_TOKEN) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  try {
    const body = await req.text()
    const res = await fetch(`${API_URL}/api/auth/anthropic/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body,
    })
    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
