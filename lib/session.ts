import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SECRET      = new TextEncoder().encode(process.env.SESSION_SECRET!)
const COOKIE_NAME = 'session'
const MAX_AGE_SEC = 8 * 60 * 60          // 8 hours absolute max
const RENEW_AFTER = 30 * 60              // renew cookie if < 30 min remaining

export interface SessionPayload {
  userId: string
  username: string
  role: string
  displayName: string
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(SECRET)
}

export async function decrypt(token?: string): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function createSession(payload: SessionPayload) {
  const token = await encrypt(payload)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: MAX_AGE_SEC,
    path: '/',
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const payload = await decrypt(token)
  if (!payload) return null

  // Sliding window: renew cookie if token is close to expiry
  try {
    const { payload: raw } = await jwtVerify(token, SECRET)
    const exp = raw.exp as number
    const secondsLeft = exp - Math.floor(Date.now() / 1000)
    if (secondsLeft > 0 && secondsLeft < RENEW_AFTER) {
      // re-issue silently
      await createSession(payload)
    }
  } catch {
    // ignore renewal error — session still valid
  }

  return payload
}
