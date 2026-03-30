'use client'

import { usePathname } from 'next/navigation'

interface Crumb {
  section: string
  label: string
}

const crumbMap: Array<{ match: (p: string) => boolean; crumb: Crumb }> = [
  { match: p => p === '/',                  crumb: { section: 'Overview',       label: 'Dashboard'    } },
  { match: p => p.startsWith('/model'),     crumb: { section: 'AI Setup',       label: 'Model & Keys' } },
  { match: p => p.startsWith('/compaction'),crumb: { section: 'AI Setup',       label: 'Compaction'   } },
  { match: p => p.startsWith('/agents'),    crumb: { section: 'Channels',       label: 'Agents'       } },
  { match: p => p.startsWith('/telegram'),  crumb: { section: 'Channels',       label: 'Telegram'     } },
  { match: p => p.startsWith('/webchat'),   crumb: { section: 'Channels',       label: 'Webchat'      } },
  { match: p => p.startsWith('/mcp'),       crumb: { section: 'Channels',       label: 'MCP'          } },
  { match: p => p.startsWith('/chats'),     crumb: { section: 'Conversations',  label: 'Chat History' } },
  { match: p => p.startsWith('/monitor'),   crumb: { section: 'Conversations',  label: 'Live Sessions'} },
  { match: p => p.startsWith('/analysis'),  crumb: { section: 'System',         label: 'Analysis'     } },
  { match: p => p.startsWith('/logs'),      crumb: { section: 'System',         label: 'Logs'         } },
  { match: p => p.startsWith('/members'),   crumb: { section: 'System',         label: 'Members'      } },
  { match: p => p.startsWith('/guide'),     crumb: { section: 'Help',           label: 'User Guide'   } },
]

export default function Breadcrumb() {
  const pathname = usePathname()
  const found = crumbMap.find(({ match }) => match(pathname))
  if (!found) return null
  const { section, label } = found.crumb

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-zinc-400 dark:text-zinc-600">{section}</span>
      <span className="text-zinc-300 dark:text-zinc-700">/</span>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    </div>
  )
}
