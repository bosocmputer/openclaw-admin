'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import bcrypt from 'bcryptjs'
import sql from '@/lib/db'
import { createSession, deleteSession } from '@/lib/session'
import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

// Constant-time response to prevent timing attacks (always ~1s)
async function constantTime<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  const result = await fn()
  const elapsed = Date.now() - start
  if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed))
  return result
}

export async function login(formData: FormData) {
  const username = (formData.get('username') as string)?.trim()
  const password = (formData.get('password') as string) ?? ''

  if (!username || !password) {
    return { error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }
  }

  // Rate limit by username (+ optionally IP)
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateLimitKey = `login:${username}:${ip}`

  const { allowed, retryAfterSec } = checkLoginRateLimit(rateLimitKey)
  if (!allowed) {
    const mins = Math.ceil(retryAfterSec / 60)
    return { error: `พยายามเข้าสู่ระบบมากเกินไป กรุณารอ ${mins} นาที` }
  }

  return constantTime(async () => {
    const users = await sql`
      SELECT id, username, password, role, display_name
      FROM admin_users
      WHERE username = ${username} AND is_active = true
      LIMIT 1
    `

    const user = users[0]
    if (!user) {
      recordFailedLogin(rateLimitKey)
      await audit({ actor: username, action: 'login_failed', detail: 'user not found', ip })
      return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      recordFailedLogin(rateLimitKey)
      await audit({ actor: username, action: 'login_failed', detail: 'wrong password', ip })
      return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
    }

    clearLoginAttempts(rateLimitKey)
    await audit({ actor: username, action: 'login', ip })

    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name ?? user.username,
    })

    redirect('/')
  })
}

export async function logout() {
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (session) await audit({ actor: session.username, action: 'logout' })
  await deleteSession()
  redirect('/login')
}
