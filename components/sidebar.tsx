'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { useTransition } from 'react'
import { logout } from '@/app/actions/auth'
import { Sun, Moon } from 'lucide-react'

interface NavItem {
  href: string
  label: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const adminGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/', label: 'Dashboard' },
    ],
  },
  {
    label: 'AI Setup',
    items: [
      { href: '/model', label: 'Model & Keys' },
      { href: '/compaction', label: 'Compaction' },
    ],
  },
  {
    label: 'Channels',
    items: [
      { href: '/agents', label: 'Agents' },
      { href: '/telegram', label: 'Telegram' },
      { href: '/line', label: 'LINE OA' },
      { href: '/webchat', label: 'Webchat' },
    ],
  },
  {
    label: 'Conversations',
    items: [
      { href: '/monitor', label: 'Live Sessions' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/analysis', label: 'Analysis' },
      { href: '/logs', label: 'Logs' },
    ],
  },
  {
    label: 'Help',
    items: [
      { href: '/guide', label: 'User Guide' },
    ],
  },
]

const superadminItem: NavItem = { href: '/members', label: 'Members' }

const chatNavItems: NavItem[] = [
  { href: '/webchat', label: 'Webchat' },
]

interface SidebarProps {
  role?: string
  username?: string
  displayName?: string
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
          : 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'
      )}
    >
      {label}
    </Link>
  )
}

export default function Sidebar({ role, username, displayName }: SidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const { theme, setTheme } = useTheme()

  if (role === 'chat') {
    return (
      <aside className="w-52 shrink-0 border-r bg-zinc-50 dark:bg-zinc-900 flex flex-col">
        <div className="px-5 py-4 border-b">
          <span className="font-bold text-base tracking-tight">OpenClaw Admin</span>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {chatNavItems.map(({ href, label }) => (
            <NavLink key={href} href={href} label={label} pathname={pathname} />
          ))}
        </nav>
      </aside>
    )
  }

  // Build system group items including members for superadmin
  const groups = adminGroups.map(group => {
    if (group.label === 'System' && role === 'superadmin') {
      return { ...group, items: [...group.items, superadminItem] }
    }
    return group
  })

  return (
    <aside className="w-52 shrink-0 border-r bg-zinc-50 dark:bg-zinc-900 flex flex-col">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <span className="font-bold text-sm tracking-tight">OpenClaw Admin</span>
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1 rounded-md text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>
      </div>
      <nav className="flex flex-col flex-1 overflow-y-auto p-3 gap-4">
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ href, label }) => (
                <NavLink key={href} href={href} label={label} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t space-y-1">
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
