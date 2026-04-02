import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// Endpoints accessible only by admin/superadmin — chat role is blocked
const ADMIN_ONLY_PREFIXES = [
  'api/members',
  'api/config',
  'api/agents',
  'api/telegram',
  'api/line',
  'api/model',
  'api/gateway',
  'api/compaction',
  'api/logs',
  'api/analysis',
  'api/alert',
]

function isAdminOnly(path: string[]): boolean {
  const joined = path.join('/')
  return ADMIN_ONLY_PREFIXES.some(prefix => joined === prefix || joined.startsWith(prefix + '/'))
}

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const API_URL   = process.env.API_URL
  const API_TOKEN = process.env.API_TOKEN
  if (!API_URL || !API_TOKEN) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const { path } = await params

  if (isAdminOnly(path) && session.role === 'chat') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // path[0] is "api" (from /api/status → ["api","status"]) — pass through as-is
  const upstream = `${API_URL}/${path.join('/')}${req.nextUrl.search}`

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
