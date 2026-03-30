'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, type MonitorData, type MonitorEvent } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ─── Time helpers ──────────────────────────────────────────────────────────────
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
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

function tsToSec(ts: string): number {
  const p = ts.split(':')
  if (p.length < 3) return 0
  return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2])
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FlatEvent {
  ts: string
  tsThai: string
  type: string
  text: string
  agentId: string
  channel: 'webchat' | 'telegram' | 'line'
  user: string
  sessionKey: string
  isLive: boolean
  responseDuration?: number
}

interface SessionGroup {
  sessionKey: string
  agentId: string
  channel: 'webchat' | 'telegram' | 'line'
  user: string
  state: string
  lastMessageAt: string | null
  elapsed: number
  events: FlatEvent[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const AGENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {}
const COLOR_POOL = [
  { text: 'text-blue-400',    bg: 'bg-blue-950/40',    border: 'border-blue-700' },
  { text: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-700' },
  { text: 'text-orange-400',  bg: 'bg-orange-950/40',  border: 'border-orange-700' },
  { text: 'text-pink-400',    bg: 'bg-pink-950/40',    border: 'border-pink-700' },
  { text: 'text-cyan-400',    bg: 'bg-cyan-950/40',    border: 'border-cyan-700' },
  { text: 'text-violet-400',  bg: 'bg-violet-950/40',  border: 'border-violet-700' },
]
let colorIdx = 0
function agentColor(id: string) {
  if (!AGENT_COLORS[id]) {
    AGENT_COLORS[id] = COLOR_POOL[colorIdx % COLOR_POOL.length]
    colorIdx++
  }
  return AGENT_COLORS[id]
}

function stateInfo(state: string): { icon: string; label: string; cls: string; dot: string } {
  switch (state) {
    case 'thinking':  return { icon: '🤔', label: 'กำลังคิด',   cls: 'text-yellow-400', dot: 'bg-yellow-400' }
    case 'tool_call': return { icon: '🔍', label: 'ค้นข้อมูล', cls: 'text-purple-400', dot: 'bg-purple-400' }
    case 'replied':   return { icon: '✅', label: 'ตอบแล้ว',   cls: 'text-green-400',  dot: 'bg-green-400' }
    case 'error':     return { icon: '❌', label: 'Error',      cls: 'text-red-400',    dot: 'bg-red-400' }
    default:          return { icon: '💤', label: 'รอ',         cls: 'text-zinc-500',   dot: 'bg-zinc-600' }
  }
}

function durationColor(sec: number): string {
  if (sec < 5) return 'text-green-400'
  if (sec < 15) return 'text-yellow-400'
  return 'text-red-400'
}

function typeBadge(type: string) {
  switch (type) {
    case 'message':  return { icon: '📩', cls: 'text-zinc-400' }
    case 'thinking': return { icon: '💭', cls: 'text-yellow-500' }
    case 'tool':     return { icon: '🔧', cls: 'text-purple-400' }
    case 'reply':    return { icon: '✅', cls: 'text-green-400' }
    case 'error':    return { icon: '❌', cls: 'text-red-400' }
    default:         return { icon: '·',  cls: 'text-zinc-600' }
  }
}

// ─── Data transform ────────────────────────────────────────────────────────────
function buildGroups(data: MonitorData): SessionGroup[] {
  const groups: SessionGroup[] = []

  for (const agent of data.agents) {
    const channels: Array<{ ch: 'webchat' | 'telegram' | 'line'; sessions: NonNullable<typeof agent.channels.webchat> }> = [
      { ch: 'webchat',  sessions: agent.channels.webchat  ?? [] },
      { ch: 'telegram', sessions: agent.channels.telegram ?? [] },
      { ch: 'line',     sessions: agent.channels.line     ?? [] },
    ]
    for (const { ch, sessions } of channels) {
      for (const session of sessions) {
        const isActive = session.state === 'thinking' || session.state === 'tool_call'
        let lastMsgTs: string | null = null
        const events: FlatEvent[] = []

        const evList = session.events as MonitorEvent[]
        for (let i = 0; i < evList.length; i++) {
          const e = evList[i]
          const isLast = i === evList.length - 1
          let responseDuration: number | undefined

          if (e.type === 'message') {
            lastMsgTs = e.ts
          } else if (e.type === 'reply' && lastMsgTs) {
            const diff = tsToSec(e.ts) - tsToSec(lastMsgTs)
            const real = diff < 0 ? diff + 86400 : diff
            if (real >= 0 && real < 3600) responseDuration = real
            lastMsgTs = null
          }

          events.push({
            ts: e.ts,
            tsThai: tsToThai(e.ts),
            type: e.type,
            text: e.text,
            agentId: agent.id,
            channel: ch,
            user: session.user,
            sessionKey: session.sessionKey,
            isLive: isActive && isLast,
            responseDuration,
          })
        }

        groups.push({
          sessionKey: session.sessionKey,
          agentId: agent.id,
          channel: ch,
          user: session.user,
          state: session.state,
          lastMessageAt: session.lastMessageAt,
          elapsed: session.elapsed ?? 0,
          events,
        })
      }
    }
  }

  return groups.sort((a, b) => {
    const o = (s: string) => (s === 'thinking' || s === 'tool_call' ? 0 : s === 'replied' ? 1 : s === 'error' ? 2 : 3)
    const d = o(a.state) - o(b.state)
    if (d !== 0) return d
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
  })
}

// ─── Overview Card ─────────────────────────────────────────────────────────────
function OverviewCard({
  group,
  isSelected,
  onClick,
}: {
  group: SessionGroup
  isSelected: boolean
  onClick: () => void
}) {
  const st = stateInfo(group.state)
  const ac = agentColor(group.agentId)
  const isActive = group.state === 'thinking' || group.state === 'tool_call'
  const userShort = group.user.replace('direct:', '').slice(0, 10)
  const lastMsg = group.events.filter(e => e.type === 'message').at(-1)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        shrink-0 w-52 text-left rounded-lg border p-3 transition-all duration-200
        hover:brightness-110 cursor-pointer
        ${isSelected ? `${ac.border} ${ac.bg}` : 'border-zinc-800 bg-zinc-900'}
      `}
    >
      {/* Top: agent name + state dot */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-sm font-semibold ${ac.text}`}>{group.agentId}</span>
        <span className="flex items-center gap-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${st.dot} ${isActive ? 'anim-pulse' : ''}`}
          />
          <span className={`text-xs ${st.cls}`}>{st.icon}</span>
        </span>
      </div>

      {/* Channel + user */}
      <div className="text-xs text-zinc-500 mb-1.5 truncate">
        {group.channel === 'telegram' ? '✈️' : group.channel === 'line' ? '💚' : '🌐'} {userShort}
      </div>

      {/* State label + elapsed */}
      <div className={`text-xs font-medium ${st.cls}`}>
        {st.label}
        {(group.state === 'thinking' || group.state === 'tool_call') && group.elapsed > 0 && (
          <span className="text-zinc-500 ml-1">{group.elapsed}s</span>
        )}
      </div>

      {/* Last user message preview */}
      {lastMsg && (
        <div className="text-xs text-zinc-600 mt-1 truncate">
          {lastMsg.text.slice(0, 40)}
        </div>
      )}

      {/* Time ago */}
      {group.lastMessageAt && (
        <div className="text-xs text-zinc-700 mt-1">
          {relativeTime(group.lastMessageAt)} ago
        </div>
      )}
    </button>
  )
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({
  groups,
  selectedKey,
  search,
  setSearch,
  stateFilter,
  setStateFilter,
  autoScroll,
  setAutoScroll,
  bottomRef,
}: {
  groups: SessionGroup[]
  selectedKey: string | null
  search: string
  setSearch: (v: string) => void
  stateFilter: string
  setStateFilter: (v: string) => void
  autoScroll: boolean
  setAutoScroll: (v: boolean) => void
  bottomRef: React.RefObject<HTMLDivElement | null>
}) {
  // ถ้าเลือก session → แสดงเฉพาะ session นั้น
  // ถ้าไม่เลือก → แสดง global stream (ทุก event รวมกัน เรียงตามเวลา)
  const isGlobal = selectedKey === null

  let events: FlatEvent[] = []
  let panelTitle = 'Global stream — ทุก session'

  if (isGlobal) {
    // รวม events ทุก session เรียงตาม ts
    events = groups.flatMap(g => g.events)
    events.sort((a, b) => a.ts.localeCompare(b.ts))
  } else {
    const g = groups.find(g => g.sessionKey === selectedKey)
    if (g) {
      const ac = agentColor(g.agentId)
      const st = stateInfo(g.state)
      panelTitle = `${g.agentId} · ${g.channel} · ${g.user.replace('direct:', '')}  ${st.icon} ${st.label}`
      events = g.events
      void ac
    }
  }

  // filter
  const q = search.toLowerCase()
  const filtered = events.filter(e => {
    if (stateFilter !== 'ALL') {
      const typeMap: Record<string, string[]> = {
        thinking: ['thinking'], tool: ['tool'], replied: ['reply'], error: ['error'], message: ['message'],
      }
      if (!(typeMap[stateFilter] ?? []).includes(e.type)) return false
    }
    if (q) return e.text.toLowerCase().includes(q) || e.agentId.includes(q) || e.user.includes(q)
    return true
  })

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Panel header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-zinc-300 font-mono truncate flex-1">
          {isGlobal ? (
            <span className="text-zinc-500">📡 {panelTitle}</span>
          ) : (
            <span>{panelTitle}</span>
          )}
        </span>

        {/* State filter pills */}
        <div className="flex gap-1 flex-wrap">
          {[
            { id: 'ALL',      label: 'ทั้งหมด' },
            { id: 'message',  label: '📩 msg' },
            { id: 'thinking', label: '💭 think' },
            { id: 'tool',     label: '🔧 tool' },
            { id: 'replied',  label: '✅ reply' },
            { id: 'error',    label: '❌ error' },
          ].map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStateFilter(s.id)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                stateFilter === s.id
                  ? 'bg-zinc-700 text-white border-zinc-600'
                  : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <Input
          placeholder="ค้นหา..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-36 h-7 text-xs"
        />

        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto scroll
        </label>
      </div>

      {/* Log area */}
      <div className="border rounded-xl bg-zinc-950 font-mono text-xs flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <p className="text-zinc-600 text-center py-12">ไม่มีข้อมูล</p>
        ) : (
          filtered.map((e, i) => {
            const badge = typeBadge(e.type)
            const ac = agentColor(e.agentId)
            let rowCls = 'hover:bg-zinc-900'
            if (e.isLive) rowCls = 'row-live'
            else if (e.type === 'thinking') rowCls = 'bg-yellow-950/15 hover:bg-yellow-950/25'
            else if (e.type === 'tool')     rowCls = 'bg-purple-950/15 hover:bg-purple-950/25'
            else if (e.type === 'error')    rowCls = 'bg-red-950/20 hover:bg-red-950/30'

            return (
              <div key={i} className={`flex items-start gap-0 px-3 py-0.5 leading-5 transition-colors ${rowCls}`}>
                {/* time */}
                <span className="shrink-0 w-20 text-zinc-600">{e.tsThai}</span>

                {/* agent·ch — only in global mode */}
                {isGlobal && (
                  <span className={`shrink-0 w-24 ${ac.text} truncate`}>
                    {e.agentId}·{e.channel === 'telegram' ? 'tg' : e.channel === 'line' ? 'line' : 'web'}
                  </span>
                )}

                {/* user — only in global mode */}
                {isGlobal && (
                  <span className="shrink-0 w-24 text-zinc-600 truncate">
                    {e.user.replace('direct:', '').slice(0, 12)}
                  </span>
                )}

                {/* type icon */}
                <span className={`shrink-0 w-7 ${badge.cls}`}>{badge.icon}</span>

                {/* message */}
                <span
                  className="flex-1 text-zinc-300 truncate"
                  title={e.text}
                >
                  {e.text}
                  {e.isLive && <span className="thinking-dots ml-0.5 text-yellow-500" />}
                </span>

                {/* duration */}
                {e.type === 'reply' && e.responseDuration != null && (
                  <span className={`shrink-0 w-12 text-right ${durationColor(e.responseDuration)}`}>
                    {e.responseDuration.toFixed(1)}s
                  </span>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <p className="text-xs text-zinc-600">{filtered.length} events{filtered.length !== events.length ? ` (กรองจาก ${events.length})` : ''}</p>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const [paused, setPaused] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['monitor'],
    queryFn: getMonitorEvents,
    refetchInterval: paused ? false : 3000,
  })

  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [dataUpdatedAt, autoScroll, paused])

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      })
    : '--:--'

  const groups = data ? buildGroups(data) : []
  const stats = data?.stats

  // ถ้า selectedKey หายไป (session expired) → reset to global
  const selectedGroup = groups.find(g => g.sessionKey === selectedKey) ?? null
  const effectiveKey = selectedGroup ? selectedKey : null

  // longest + errors สำหรับ insight
  let longestDur = 0
  let longestLabel = ''
  let errorCount = 0
  for (const g of groups) {
    for (const e of g.events) {
      if (e.type === 'error') errorCount++
      if (e.type === 'reply' && e.responseDuration && e.responseDuration > longestDur) {
        longestDur = e.responseDuration
        longestLabel = `${g.agentId}·${g.user.replace('direct:', '').slice(-6)}`
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-120px)] w-full">

      {/* ── Title bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Monitor</h1>
          <p className="text-sm text-zinc-500 mt-0.5">อัปเดต {updatedStr}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Insight pills */}
          {stats && (
            <div className="flex gap-1.5 flex-wrap text-xs">
              <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400">🤖 {stats.totalAgents} agents</span>
              <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-yellow-400">⚡ {stats.activeNow} active</span>
              <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400">💬 {stats.todayMessages} วันนี้</span>
              <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400">⏱ avg {stats.avgResponseTime.toFixed(1)}s</span>
              {longestDur > 0 && (
                <span className={`px-2.5 py-1 rounded-full bg-zinc-900 ${durationColor(longestDur)}`}>
                  🐢 {longestDur.toFixed(1)}s ({longestLabel})
                </span>
              )}
              {errorCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-950 text-red-400">❌ {errorCount} errors</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: paused ? '#52525b' : '#22c55e' }}>
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: paused ? '#52525b' : '#22c55e', animation: paused ? 'none' : 'livePulse 2s ease-in-out infinite' }}
              />
              {paused ? 'Paused' : 'Live'}
            </span>
            <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={() => setPaused(v => !v)}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Overview bar ── */}
      <div className="shrink-0">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {/* Global stream card */}
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className={`shrink-0 w-36 text-left rounded-lg border p-3 transition-all duration-200 hover:brightness-110 ${
              effectiveKey === null
                ? 'border-zinc-500 bg-zinc-800'
                : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <div className="text-sm font-semibold text-zinc-300 mb-1">📡 ทั้งหมด</div>
            <div className="text-xs text-zinc-500">{groups.length} sessions</div>
            <div className="text-xs text-zinc-600 mt-1">
              {groups.reduce((n, g) => n + g.events.length, 0)} events
            </div>
          </button>

          {/* Session cards */}
          {groups.map(g => (
            <OverviewCard
              key={g.sessionKey}
              group={g}
              isSelected={effectiveKey === g.sessionKey}
              onClick={() => setSelectedKey(prev => prev === g.sessionKey ? null : g.sessionKey)}
            />
          ))}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <DetailPanel
        groups={groups}
        selectedKey={effectiveKey}
        search={search}
        setSearch={setSearch}
        stateFilter={stateFilter}
        setStateFilter={setStateFilter}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        bottomRef={bottomRef}
      />

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .anim-pulse {
          animation: livePulse 1.5s ease-in-out infinite;
        }
        .row-live {
          animation: rowGlow 2s ease-in-out infinite;
        }
        @keyframes rowGlow {
          0%, 100% { background-color: rgba(234,179,8,0.07); }
          50%       { background-color: rgba(234,179,8,0.16); }
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
