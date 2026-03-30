'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, type MonitorData, type MonitorEvent } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

function tsToSec(ts: string): number {
  const p = ts.split(':')
  if (p.length < 3) return 0
  return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2])
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
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
function stateInfo(state: string) {
  switch (state) {
    case 'thinking':  return { label: 'กำลังคิด',   dot: 'bg-yellow-400', cls: 'text-yellow-400' }
    case 'tool_call': return { label: 'ค้นข้อมูล', dot: 'bg-purple-400', cls: 'text-purple-400' }
    case 'replied':   return { label: 'ตอบแล้ว',   dot: 'bg-green-400',  cls: 'text-green-400'  }
    case 'error':     return { label: 'Error',      dot: 'bg-red-400',    cls: 'text-red-400'    }
    default:          return { label: 'รอ',         dot: 'bg-zinc-600',   cls: 'text-zinc-500'   }
  }
}

function durationColor(sec: number) {
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

const AGENT_COLORS = ['text-blue-400', 'text-emerald-400', 'text-orange-400', 'text-pink-400', 'text-cyan-400', 'text-violet-400']
const agentColorMap: Record<string, string> = {}
let agentColorIdx = 0
function agentColor(id: string) {
  if (!agentColorMap[id]) { agentColorMap[id] = AGENT_COLORS[agentColorIdx++ % AGENT_COLORS.length] }
  return agentColorMap[id]
}

// ─── Channel Icon ──────────────────────────────────────────────────────────────
function ChannelIcon({ channel }: { channel: 'webchat' | 'telegram' | 'line' }) {
  if (channel === 'telegram') {
    return (
      <svg className="inline-block w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="#29B2E8" aria-label="Telegram">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    )
  }
  if (channel === 'line') {
    return (
      <svg className="inline-block w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="#06C755" aria-label="LINE">
        <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.627.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.070 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
      </svg>
    )
  }
  return (
    <svg className="inline-block w-3.5 h-3.5 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="currentColor" aria-label="Webchat">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
    </svg>
  )
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
            ts: e.ts, tsThai: tsToThai(e.ts), type: e.type, text: e.text,
            agentId: agent.id, channel: ch, user: session.user,
            sessionKey: session.sessionKey, isLive: isActive && isLast, responseDuration,
          })
        }

        groups.push({
          sessionKey: session.sessionKey, agentId: agent.id, channel: ch,
          user: session.user, state: session.state,
          lastMessageAt: session.lastMessageAt, elapsed: session.elapsed ?? 0, events,
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
  const activeCount = groups.filter(g => g.state === 'thinking' || g.state === 'tool_call').length

  const selectedGroup = groups.find(g => g.sessionKey === selectedKey) ?? null
  const effectiveKey = selectedGroup ? selectedKey : null

  let longestDur = 0
  let errorCount = 0
  for (const g of groups) {
    for (const e of g.events) {
      if (e.type === 'error') errorCount++
      if (e.type === 'reply' && e.responseDuration && e.responseDuration > longestDur) {
        longestDur = e.responseDuration
      }
    }
  }

  // ─── Events to display ────────────────────────────────────────────────────
  const isGlobal = effectiveKey === null
  let events: FlatEvent[] = []
  let panelTitle = 'ทุก session'

  if (isGlobal) {
    events = groups.flatMap(g => g.events)
    events.sort((a, b) => a.ts.localeCompare(b.ts))
  } else {
    const g = groups.find(g => g.sessionKey === effectiveKey)
    if (g) {
      panelTitle = `${g.agentId} · ${g.channel} · ${g.user.replace('direct:', '')}`
      events = g.events
    }
  }

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
    <div className="space-y-6 w-full">

      {/* ── Title + controls ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">อัปเดต {updatedStr}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stats && (
            <>
              <Badge variant="secondary">{stats.totalAgents} agents</Badge>
              {activeCount > 0
                ? <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:text-yellow-400">⚡ {activeCount} active</Badge>
                : <Badge variant="secondary">0 active</Badge>
              }
              <Badge variant="secondary">💬 {stats.todayMessages} วันนี้</Badge>
              <Badge variant="secondary">avg {stats.avgResponseTime.toFixed(1)}s</Badge>
              {longestDur > 0 && (
                <Badge variant="outline" className={durationColor(longestDur)}>🐢 {longestDur.toFixed(1)}s</Badge>
              )}
              {errorCount > 0 && <Badge variant="destructive">{errorCount} errors</Badge>}
            </>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${paused ? 'text-muted-foreground' : 'text-green-500'}`}>
              ● {paused ? 'Paused' : 'Live'}
            </span>
            <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={() => setPaused(v => !v)}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Sessions ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              Sessions
              <span className="ml-2 text-sm font-normal text-muted-foreground">{groups.length} รายการ</span>
              {activeCount > 0 && (
                <span className="ml-2 text-sm font-medium text-yellow-500">· {activeCount} active</span>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant={effectiveKey === null ? 'secondary' : 'ghost'}
              onClick={() => setSelectedKey(null)}
            >
              ทั้งหมด
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-3 px-0 pb-0">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">ไม่มี session</p>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              {/* header row */}
              <div className="flex items-center gap-3 px-4 pb-1 text-xs font-medium text-muted-foreground border-b">
                <span className="w-2" />
                <span className="w-4" />
                <span className="w-28">Agent</span>
                <span className="w-36">User</span>
                <span className="flex-1">สถานะ</span>
                <span className="w-12 text-right">เมื่อ</span>
              </div>
              {groups.map(g => {
                const st = stateInfo(g.state)
                const isActive = g.state === 'thinking' || g.state === 'tool_call'
                const isSelected = effectiveKey === g.sessionKey
                return (
                  <button
                    key={g.sessionKey}
                    type="button"
                    onClick={() => setSelectedKey(prev => prev === g.sessionKey ? null : g.sessionKey)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-xs transition-colors border-b last:border-0
                      ${isSelected ? 'bg-muted' : 'hover:bg-muted/50'}`}
                  >
                    <span className={`shrink-0 w-2 h-2 rounded-full ${st.dot} ${isActive ? 'anim-pulse' : ''}`} />
                    <span className="shrink-0 w-4 flex justify-center"><ChannelIcon channel={g.channel} /></span>
                    <span className={`shrink-0 w-28 truncate font-mono font-medium ${agentColor(g.agentId)}`}>{g.agentId}</span>
                    <span className="shrink-0 w-36 truncate text-muted-foreground">{g.user.replace('direct:', '')}</span>
                    <span className={`flex-1 ${st.cls}`}>
                      {st.label}{isActive && g.elapsed > 0 ? ` ${g.elapsed}s` : ''}
                    </span>
                    {g.lastMessageAt && (
                      <span className="shrink-0 w-12 text-right text-muted-foreground tabular-nums">
                        {relativeTime(g.lastMessageAt)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Event log ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium flex-1 min-w-0 truncate">
            {isGlobal
              ? <span className="text-muted-foreground">📡 {panelTitle}</span>
              : panelTitle
            }
          </p>
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
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  stateFilter === s.id
                    ? 'bg-foreground text-background border-foreground dark:bg-white dark:text-zinc-900'
                    : 'border-input text-muted-foreground hover:border-foreground/40'
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
            className="w-36 h-8 text-xs"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            Auto scroll
          </label>
        </div>

        {/* Log panel */}
        <div className="border rounded-xl bg-zinc-950 font-mono text-xs h-[480px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-zinc-600 text-center py-12">ไม่มีข้อมูล</p>
          ) : (
            filtered.map((e, i) => {
              const badge = typeBadge(e.type)
              let rowCls = 'hover:bg-zinc-900'
              if (e.isLive)                   rowCls = 'row-live'
              else if (e.type === 'thinking') rowCls = 'bg-yellow-950/15 hover:bg-yellow-950/25'
              else if (e.type === 'tool')     rowCls = 'bg-purple-950/15 hover:bg-purple-950/25'
              else if (e.type === 'error')    rowCls = 'bg-red-950/20 hover:bg-red-950/30'

              return (
                <div key={i} className={`flex items-start px-2 py-0.5 leading-5 rounded transition-colors ${rowCls}`}>
                  <span className="shrink-0 w-20 text-zinc-600">{e.tsThai}</span>
                  {isGlobal && (
                    <span className={`shrink-0 w-24 truncate ${agentColor(e.agentId)}`}>
                      {e.agentId}·{e.channel === 'telegram' ? 'tg' : e.channel === 'line' ? 'line' : 'web'}
                    </span>
                  )}
                  {isGlobal && (
                    <span className="shrink-0 w-24 text-zinc-600 truncate">
                      {e.user.replace('direct:', '').slice(0, 12)}
                    </span>
                  )}
                  <span className={`shrink-0 w-7 ${badge.cls}`}>{badge.icon}</span>
                  <span className="flex-1 text-zinc-300 truncate" title={e.text}>
                    {e.text}
                    {e.isLive && <span className="thinking-dots ml-0.5 text-yellow-400" />}
                  </span>
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

        <p className="text-xs text-muted-foreground">
          {filtered.length} events{filtered.length !== events.length ? ` (กรองจาก ${events.length})` : ''}
        </p>
      </div>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .anim-pulse { animation: livePulse 1.5s ease-in-out infinite; }
        .row-live { animation: rowGlow 2s ease-in-out infinite; }
        @keyframes rowGlow {
          0%, 100% { background-color: rgba(234,179,8,0.07); }
          50%       { background-color: rgba(234,179,8,0.16); }
        }
        .thinking-dots::after { content: ''; animation: dots 1.4s infinite; }
        @keyframes dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } 100% { content: ''; } }
      `}</style>
    </div>
  )
}
