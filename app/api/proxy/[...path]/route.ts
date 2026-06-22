import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { audit, type AuditAction } from '@/lib/audit'

const CHAT_ALLOWED_PREFIXES = [
  'api/webchat/rooms',
  'api/webchat/history',
  'api/webchat/send',
]

const ROUTE_ROLE_ALLOWLIST: Record<string, Array<'superadmin' | 'admin' | 'chat'>> = {
  'api/webchat/rooms': ['superadmin', 'admin', 'chat'],
  'api/webchat/history': ['superadmin', 'admin', 'chat'],
  'api/webchat/send': ['superadmin', 'admin', 'chat'],
}

function hasPrefix(path: string[], prefixes: string[]): boolean {
  const joined = path.join('/')
  return prefixes.some(prefix => joined === prefix || joined.startsWith(prefix + '/'))
}

function roleAllowed(path: string[], role: string): boolean {
  const joined = path.join('/')
  if (role === 'superadmin' || role === 'admin') return true
  if (role !== 'chat') return false
  const matched = Object.entries(ROUTE_ROLE_ALLOWLIST)
    .find(([prefix]) => joined === prefix || joined.startsWith(prefix + '/'))
  return Boolean(matched?.[1].includes('chat')) && hasPrefix(path, CHAT_ALLOWED_PREFIXES)
}

function auditFor(method: string, path: string[]): { action: AuditAction; target?: string; detail?: string } | null {
  const [api, group, id, child, childId] = path
  if (api !== 'api') return null
  if (method === 'PUT' && group === 'config') return { action: 'config.update', detail: 'openclaw.json updated' }
  if (method === 'PUT' && group === 'models' && id === 'settings') {
    return { action: 'config.update', detail: 'model settings updated' }
  }
  if (method === 'POST' && group === 'gateway' && id === 'restart') return { action: 'gateway.restart' }
  if (group === 'analysis' && id === 'conversations') {
    if (method === 'POST' && child === 'backfill') return { action: 'conversation.backfill', detail: 'conversation history backfill requested' }
    if (method === 'GET' && child === 'export') return { action: 'conversation.export', detail: 'conversation history exported' }
  }
  if (group === 'business-profiles') {
    if (method === 'POST' && !id) return { action: 'business_profile.create' }
    if (method === 'PUT' && id) return { action: 'business_profile.update', target: id }
    if (method === 'DELETE' && id && child === 'link-agent') return { action: 'business_profile.unlink', target: id, detail: childId }
    if (method === 'DELETE' && id) return { action: 'business_profile.delete', target: id }
    if (method === 'POST' && id && child === 'link-agent') return { action: 'business_profile.link', target: id }
  }
  if (group === 'members') {
    if (method === 'POST') return { action: 'member.create' }
    if (method === 'PUT' || method === 'PATCH') return { action: 'member.update', target: id }
    if (method === 'DELETE') return { action: 'member.delete', target: id }
  }
  if (group === 'agents' && id && child === 'soul' && method === 'PUT') {
    return { action: 'agent.soul.update', target: id }
  }
  if (group === 'agents' && id && child === 'mcp' && method === 'PUT') {
    return { action: 'agent.mcp.update', target: id }
  }
  if (group === 'agents' && id && child === 'users') {
    if (method === 'POST') return { action: 'agent.user.add', target: id }
    if (method === 'DELETE') return { action: 'agent.user.remove', target: id, detail: childId }
  }
  if (group === 'telegram') {
    if (method === 'POST' && id === 'accounts') return { action: 'telegram.account.add' }
    if (method === 'DELETE' && id === 'accounts') return { action: 'telegram.account.delete', target: child }
    if (method === 'PUT' && id === 'bindings') return { action: 'telegram.binding.update' }
  }
  if (group === 'webchat' && id === 'rooms') {
    if (method === 'POST') return { action: 'webchat.room.create' }
    if (method === 'PUT' || method === 'PATCH') return { action: 'webchat.room.update', target: child }
    if (method === 'DELETE') return { action: 'webchat.room.delete', target: child }
  }
  return null
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

  if (!roleAllowed(path, session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // path[0] is "api" (from /api/status → ["api","status"]) — pass through as-is
  const upstream = `${API_URL}/${path.join('/')}${req.nextUrl.search}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
    'X-OpenClaw-Admin-Role': session.role,
    'X-OpenClaw-Admin-User': session.username,
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
  const auditEntry = auditFor(req.method, path)
  if (res.ok && auditEntry && req.method !== 'HEAD') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined
    await audit({ actor: session.username, ip, ...auditEntry })
  }
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
