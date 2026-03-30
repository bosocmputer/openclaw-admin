'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, type MonitorData, type MonitorAgent, type MonitorEvent } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ─── Time helpers ──────────────────────────────────────────────────────────────
/** แปลง HH:MM:SS (UTC) → HH:MM:SS (Asia/Bangkok = UTC+7) */
function tsToThai(ts: string): string {
  if (!ts) return ''
  const parts = ts.split(':')
  if (parts.length < 3) return ts
  let h = parseInt(parts[0]) + 7
  const m = parts[1]
  const s = parts[2].slice(0, 2)
  if (h >= 24) h -= 24
  return `${String(h).padStart(2, '0')}:${m}:${s}`
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff} วินาทีที่แล้ว`
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
  return new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })
}

/** แปลง HH:MM:SS → seconds (for duration calc) */
function tsToSec(ts: string): number {
  const p = ts.split(':')
  if (p.length < 3) return 0
  return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2])
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FlatEvent {
  ts: string           // UTC HH:MM:SS (raw จาก server)
  tsThai: string       // แปลงเป็นไทยแล้ว
  type: string
  text: string
  agentId: string
  channel: 'webchat' | 'telegram'
  user: string
  sessionKey: string
  isLive: boolean      // event ล่าสุดของ session ที่ state = thinking/tool_call
  responseDuration?: number  // วินาทีจาก message → reply (เฉพาะ type='reply')
}

interface SessionGroup {
  sessionKey: string
  agentId: string
  channel: 'webchat' | 'telegram'
  user: string
  state: string
  lastMessageAt: string | null
  events: FlatEvent[]
}

// ─── Color helpers ─────────────────────────────────────────────────────────────
const AGENT_COLORS = [
  'text-blue-400', 'text-emerald-400', 'text-orange-400',
  'text-pink-400', 'text-cyan-400', 'text-yellow-400',
]

function buildAgentColorMap(agents: MonitorAgent[]): Record<string, string> {
  const map: Record<string, string> = {}
  agents.forEach((a, i) => { map[a.id] = AGENT_COLORS[i % AGENT_COLORS.length] })
  return map
}

function durationColor(sec: number): string {
  if (sec < 5) return 'text-green-400'
  if (sec < 15) return 'text-yellow-400'
  return 'text-red-400'
}

function typeBadge(type: string): { label: string; cls: string } {
  switch (type) {
    case 'message':  return { label: '📩 msg',   cls: 'text-zinc-400' }
    case 'thinking': return { label: '💭 think', cls: 'text-yellow-500' }
    case 'tool':     return { label: '🔧 tool',  cls: 'text-purple-400' }
    case 'reply':    return { label: '✅ reply', cls: 'text-green-400' }
    case 'error':    return { label: '❌ error', cls: 'text-red-400' }
    default:         return { label: type,       cls: 'text-zinc-500' }
  }
}

function rowBg(type: string, isLive: boolean): string {
  if (isLive) return 'row-live'
  switch (type) {
    case 'thinking': return 'bg-yellow-950/20'
    case 'tool':     return 'bg-purple-950/20'
    case 'error':    return 'bg-red-950/30'
    default:         return ''
  }
}

// ─── Data Transform ────────────────────────────────────────────────────────────
function flattenToGroups(data: MonitorData): SessionGroup[] {
  const groupMap = new Map<string, SessionGroup>()

  for (const agent of data.agents) {
    const channels: Array<{ ch: 'webchat' | 'telegram'; sessions: NonNullable<typeof agent.channels.webchat> }> = [
      { ch: 'webchat', sessions: agent.channels.webchat ?? [] },
      { ch: 'telegram', sessions: agent.channels.telegram ?? [] },
    ]
    for (const { ch, sessions } of channels) {
      for (const session of sessions) {
        const isActive = session.state === 'thinking' || session.state === 'tool_call'

        // คำนวณ response duration — จับคู่ message → reply ล่าสุด
        let lastMsgTs: string | null = null
        const eventsWithDuration: FlatEvent[] = []
        const evList = session.events as MonitorEvent[]

        for (let i = 0; i < evList.length; i++) {
          const e = evList[i]
          const isLastEvent = i === evList.length - 1
          let responseDuration: number | undefined

          if (e.type === 'message') {
            lastMsgTs = e.ts
          } else if (e.type === 'reply' && lastMsgTs) {
            const diff = tsToSec(e.ts) - tsToSec(lastMsgTs)
            const real = diff < 0 ? diff + 86400 : diff  // cross-midnight fix
            if (real >= 0 && real < 3600) responseDuration = real
            lastMsgTs = null
          }

          eventsWithDuration.push({
            ts: e.ts,
            tsThai: tsToThai(e.ts),
            type: e.type,
            text: e.text,
            agentId: agent.id,
            channel: ch,
            user: session.user,
            sessionKey: session.sessionKey,
            isLive: isActive && isLastEvent,
            responseDuration,
          })
        }

        groupMap.set(session.sessionKey, {
          sessionKey: session.sessionKey,
          agentId: agent.id,
          channel: ch,
          user: session.user,
          state: session.state,
          lastMessageAt: session.lastMessageAt,
          events: eventsWithDuration,
        })
      }
    }
  }

  // sort: active first, then by lastMessageAt desc
  return Array.from(groupMap.values()).sort((a, b) => {
    const order = (s: string) => (s === 'thinking' || s === 'tool_call' ? 0 : s === 'replied' ? 1 : s === 'error' ? 2 : 3)
    const d = order(a.state) - order(b.state)
    if (d !== 0) return d
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
  })
}

// ─── Insight Pills ─────────────────────────────────────────────────────────────
function InsightPills({ data }: { data: MonitorData }) {
  const { stats } = data
  const allGroups = flattenToGroups(data)

  // longest reply duration
  let longest = 0
  let longestLabel = ''
  for (const g of allGroups) {
    for (const e of g.events) {
      if (e.type === 'reply' && e.responseDuration && e.responseDuration > longest) {
        longest = e.responseDuration
        longestLabel = `${g.agentId} · ${g.user.slice(-8)}`
      }
    }
  }

  const errorCount = allGroups.reduce((n, g) => n + g.events.filter(e => e.type === 'error').length, 0)

  return (
    <div className="flex gap-2 flex-wrap text-xs">
      <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400">
        💬 {stats.todayMessages} events วันนี้
      </span>
      <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-yellow-500">
        ⚡ {stats.activeNow} active now
      </span>
      <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400">
        ⏱ avg {stats.avgResponseTime.toFixed(1)}s
      </span>
      <span className={`px-2.5 py-1 rounded-full bg-zinc-900 ${errorCount > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
        ❌ {errorCount} errors
      </span>
      {longest > 0 && (
        <span className={`px-2.5 py-1 rounded-full bg-zinc-900 ${durationColor(longest)}`}>
          🐢 longest {longest.toFixed(1)}s ({longestLabel})
        </span>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [agentFilter, setAgentFilter] = useState('ALL')
  const [channelFilter, setChannelFilter] = useState('ALL')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['monitor'],
    queryFn: getMonitorEvents,
    refetchInterval: paused ? false : 3000,
  })

  // auto scroll
  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [dataUpdatedAt, autoScroll, paused])

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '--:--'

  const agents = data?.agents ?? []
  const agentColorMap = buildAgentColorMap(agents)
  const agentIds = agents.map(a => a.id)

  const groups = data ? flattenToGroups(data) : []

  // filter groups
  const filteredGroups = groups.map(g => {
    // agent / channel / state filter at group level
    if (agentFilter !== 'ALL' && g.agentId !== agentFilter) return null
    if (channelFilter !== 'ALL' && g.channel !== channelFilter) return null
    if (stateFilter !== 'ALL') {
      const typeMap: Record<string, string[]> = {
        thinking: ['thinking'],
        tool: ['tool'],
        replied: ['reply'],
        error: ['error'],
      }
      const allowed = typeMap[stateFilter] ?? []
      const hasMatch = g.events.some(e => allowed.includes(e.type))
      if (!hasMatch) return null
    }

    // search filter on events
    const q = search.toLowerCase()
    const filteredEvents = q
      ? g.events.filter(e =>
          e.agentId.toLowerCase().includes(q) ||
          e.user.toLowerCase().includes(q) ||
          e.text.toLowerCase().includes(q)
        )
      : g.events

    if (filteredEvents.length === 0 && q) return null
    return { ...g, events: filteredEvents }
  }).filter(Boolean) as SessionGroup[]

  const totalEvents = filteredGroups.reduce((n, g) => n + g.events.length, 0)
  const totalAll = groups.reduce((n, g) => n + g.events.length, 0)

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function stateLabel(state: string): string {
    switch (state) {
      case 'thinking': return '🤔 thinking'
      case 'tool_call': return '🔍 tool call'
      case 'replied': return '✅ replied'
      case 'error': return '❌ error'
      default: return '😴 idle'
    }
  }

  function stateCls(state: string): string {
    switch (state) {
      case 'thinking': return 'text-yellow-500'
      case 'tool_call': return 'text-purple-400'
      case 'replied': return 'text-green-400'
      case 'error': return 'text-red-400'
      default: return 'text-zinc-500'
    }
  }

  return (
    <div className="space-y-4 w-full">

      {/* ── Title ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Monitor</h1>
          <p className="text-sm text-zinc-500 mt-0.5">ดู activity ของ AI แบบ real-time แยกห้อง แยก user</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>อัปเดต {updatedStr}</span>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: paused ? '#52525b' : '#22c55e', animation: paused ? 'none' : 'livePulse 2s ease-in-out infinite' }}
            />
            <span style={{ color: paused ? '#52525b' : '#22c55e' }}>{paused ? 'Paused' : 'Live'}</span>
          </div>
          <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={() => setPaused(v => !v)}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Row 1 */}
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            placeholder="ค้นหา agent, user, ข้อความ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-xs text-sm"
          />

          {/* Agent pills */}
          <div className="flex gap-1 flex-wrap">
            {['ALL', ...agentIds].map(id => (
              <button
                key={id}
                type="button"
                onClick={() => setAgentFilter(id)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  agentFilter === id
                    ? 'bg-zinc-900 text-white border-zinc-700'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {id === 'ALL' ? 'ทั้งหมด' : <span className={agentColorMap[id]}>{id}</span>}
              </button>
            ))}
          </div>

          {/* Channel pills */}
          <div className="flex gap-1">
            {(['ALL', 'telegram', 'webchat'] as const).map(ch => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannelFilter(ch)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  channelFilter === ch
                    ? 'bg-zinc-900 text-white border-zinc-700'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {ch === 'ALL' ? 'ทุก channel' : ch === 'telegram' ? '✈️ telegram' : '🌐 webchat'}
              </button>
            ))}
          </div>

          {/* State pills */}
          <div className="flex gap-1 flex-wrap">
            {[
              { id: 'ALL', label: 'ทุก state' },
              { id: 'thinking', label: '🤔 thinking' },
              { id: 'tool', label: '🔧 tool' },
              { id: 'replied', label: '✅ replied' },
              { id: 'error', label: '❌ error' },
            ].map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStateFilter(s.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  stateFilter === s.id
                    ? 'bg-zinc-900 text-white border-zinc-700'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Auto scroll */}
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto scroll
          </label>
        </div>

        {/* Row 2 — insight pills */}
        {data && <InsightPills data={data} />}
      </div>

      {/* ── Log Panel ── */}
      <div className="border rounded-xl bg-zinc-950 text-xs font-mono h-[580px] overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <p className="text-zinc-500 py-8 text-center">ไม่มีข้อมูลที่ตรงเงื่อนไข</p>
        ) : (
          filteredGroups.map((group, gi) => {
            const isCollapsed = collapsed.has(group.sessionKey)
            const agentCls = agentColorMap[group.agentId] ?? 'text-zinc-400'
            const chLabel = group.channel === 'telegram' ? 'tg' : 'web'
            const userShort = group.user.replace('direct:', '').slice(0, 14)
            const eventCount = group.events.length

            return (
              <div key={group.sessionKey}>
                {/* separator between groups */}
                {gi > 0 && <div className="border-t border-zinc-800/50" />}

                {/* ── Group Header ── */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(group.sessionKey)}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  <span className="text-zinc-500">{isCollapsed ? '▶' : '▼'}</span>
                  <span className={`font-semibold ${agentCls}`}>{group.agentId}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">{chLabel}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">{userShort}</span>
                  <span className={`ml-2 ${stateCls(group.state)}`}>{stateLabel(group.state)}</span>
                  {group.lastMessageAt && (
                    <span className="text-zinc-600 ml-1">{relativeTime(group.lastMessageAt)}</span>
                  )}
                  <span className="ml-auto text-zinc-600">{eventCount} events</span>
                </button>

                {/* ── Event Rows ── */}
                {!isCollapsed && group.events.map((e, ei) => {
                  const badge = typeBadge(e.type)
                  const bg = rowBg(e.type, e.isLive)
                  return (
                    <div
                      key={ei}
                      className={`flex gap-0 items-start px-3 py-0.5 leading-5 hover:bg-zinc-900 transition-colors ${bg}`}
                    >
                      {/* time */}
                      <span className="shrink-0 w-20 text-zinc-600">{e.tsThai}</span>

                      {/* agent·channel */}
                      <span className={`shrink-0 w-24 ${agentCls}`}>
                        {e.agentId}·{e.channel === 'telegram' ? 'tg' : 'web'}
                      </span>

                      {/* user */}
                      <span className="shrink-0 w-28 text-zinc-500 truncate">
                        {e.user.replace('direct:', '').slice(0, 14)}
                      </span>

                      {/* type badge */}
                      <span className={`shrink-0 w-20 ${badge.cls}`}>
                        {badge.label}{e.isLive ? <span className="thinking-dots" /> : ''}
                      </span>

                      {/* message */}
                      <span
                        className="flex-1 text-zinc-300 truncate"
                        title={e.text}
                      >
                        {e.text}
                      </span>

                      {/* duration */}
                      {e.type === 'reply' && e.responseDuration != null && (
                        <span className={`shrink-0 w-14 text-right ${durationColor(e.responseDuration)}`}>
                          {e.responseDuration.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Footer ── */}
      <p className="text-xs text-zinc-500">
        แสดง {totalEvents} / {totalAll} events
        {groups.length > 0 && ` · ${filteredGroups.length} / ${groups.length} sessions`}
      </p>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .row-live {
          animation: rowGlow 2s ease-in-out infinite;
        }
        @keyframes rowGlow {
          0%, 100% { background-color: rgba(234, 179, 8, 0.06); }
          50%       { background-color: rgba(234, 179, 8, 0.14); }
        }
        .thinking-dots::after {
          content: '';
          animation: dots 1.4s infinite;
        }
        @keyframes dots {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%  { content: '...'; }
          100% { content: ''; }
        }
      `}</style>
    </div>
  )
}
