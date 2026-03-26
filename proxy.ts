import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

const PUBLIC_ROUTES = ['/login']

// route ที่ role=chat เข้าได้
const CHAT_ALLOWED = ['/webchat']

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.includes(path)

  const token = req.cookies.get('session')?.value
  const session = await decrypt(token)

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (session && isPublic) {
    // role=chat → redirect /webchat, อื่นๆ → /
    const dest = session.role === 'chat' ? '/webchat' : '/'
    return NextResponse.redirect(new URL(dest, req.url))
  }
  // role=chat พยายามเข้า route อื่น → redirect /webchat
  if (session?.role === 'chat') {
    const allowed = CHAT_ALLOWED.some(r => path === r || path.startsWith(r + '/'))
    if (!allowed) return NextResponse.redirect(new URL('/webchat', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
