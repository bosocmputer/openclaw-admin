import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const API_URL   = process.env.API_URL!
const API_TOKEN = process.env.API_TOKEN!

if (!API_URL)   throw new Error('API_URL env var is required')
if (!API_TOKEN) throw new Error('API_TOKEN env var is required')

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path } = await params
  const upstream = `${API_URL}/api/${path.join('/')}${req.nextUrl.search}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  }

  let body: string | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text()
  }

  const res = await fetch(upstream, {
    method: req.method,
    headers,
    body,
  })

  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}

export const GET    = handler
export const POST   = handler
export const PUT    = handler
export const DELETE = handler
export const PATCH  = handler
