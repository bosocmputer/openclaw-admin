'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/model', label: 'Model' },
  { href: '/agents', label: 'Agents' },
  { href: '/telegram', label: 'Telegram' },
  { href: '/chats', label: 'Chats' },
  { href: '/logs', label: 'Logs' },
  { href: '/guide', label: 'คู่มือผู้ใช้' },
]

export default function Sidebar() {
  const pathname = usePathname()

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
    </aside>
  )
}
