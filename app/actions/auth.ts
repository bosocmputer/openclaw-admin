'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import sql from '@/lib/db'
import { createSession, deleteSession } from '@/lib/session'

export async function login(formData: FormData) {
  const username = (formData.get('username') as string)?.trim()
  const password = (formData.get('password') as string) ?? ''

  if (!username || !password) {
    return { error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }
  }

  const users = await sql`
    SELECT id, username, password, role, display_name
    FROM admin_users
    WHERE username = ${username} AND is_active = true
    LIMIT 1
  `

  const user = users[0]
  if (!user) {
    return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
  }

  await createSession({
    userId: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name ?? user.username,
  })

  redirect('/')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
