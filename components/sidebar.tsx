'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTransition } from 'react'
import { logout } from '@/app/actions/auth'

const adminNavItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/model', label: 'Model' },
  { href: '/agents', label: 'Agents' },
  { href: '/telegram', label: 'Telegram' },
  { href: '/webchat', label: 'Webchat' },
  { href: '/chats', label: 'Chats' },
  { href: '/logs', label: 'Logs' },
  { href: '/guide', label: 'คู่มือผู้ใช้' },
]

const chatNavItems = [
  { href: '/webchat', label: 'Webchat' },
]

interface SidebarProps {
  role?: string
  username?: string
  displayName?: string
}

export default function Sidebar({ role, username, displayName }: SidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const navItems = role === 'chat'
    ? chatNavItems
    : [
        ...adminNavItems,
        ...(role === 'superadmin' ? [{ href: '/members', label: 'สมาชิก' }] : []),
      ]

  return (
    <aside className="w-52 shrink-0 border-r bg-zinc-50 dark:bg-zinc-900 flex flex-col">
      <div className="px-5 py-4 border-b">
        <span className="font-bold text-base tracking-tight">OpenClaw Admin</span>
      </div>
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {navItems.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t space-y-2">
        <div className="px-3 py-1">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{displayName || username}</p>
          <p className="text-xs text-zinc-400 capitalize">{role}</p>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => logout())}
          disabled={isPending}
          className="w-full rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors text-left"
        >
          {isPending ? 'กำลังออก...' : 'ออกจากระบบ'}
        </button>
      </div>
    </aside>
  )
}
