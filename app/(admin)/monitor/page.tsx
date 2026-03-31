'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, getSessionReplay, type MonitorData, type MonitorEvent } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  latency?: number
  inputTokens?: number
  outputTokens?: number
  cost?: number
  toolResult?: string
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
            latency: (e as MonitorEvent).latency,
            inputTokens: (e as MonitorEvent).inputTokens,
            outputTokens: (e as MonitorEvent).outputTokens,
            cost: (e as MonitorEvent).cost,
            toolResult: (e as MonitorEvent).toolResult,
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
  const [expandedIdxSet, setExpandedIdxSet] = useState<Set<number>>(new Set())
  const [expandAll, setExpandAll] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
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

  // Replay queries (need selectedGroup declared first)
  const replayAgentId = selectedGroup?.agentId ?? null
  const { data: replayData, isLoading: replayLoading } = useQuery({
    queryKey: ['session-replay', replayAgentId, selectedKey],
    queryFn: () => getSessionReplay(replayAgentId!, selectedKey!),
    enabled: replayOpen && replayAgentId !== null && selectedKey !== null,
  })

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

  if (isGlobal) {
    events = groups.flatMap(g => g.events)
    events.sort((a, b) => a.ts.localeCompare(b.ts))
  } else {
    const g = groups.find(g => g.sessionKey === effectiveKey)
    if (g) events = g.events
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

  function handleToggleExpandAll() {
    if (expandAll) {
      setExpandedIdxSet(new Set())
      setExpandAll(false)
    } else {
      setExpandedIdxSet(new Set(Array.from({ length: filtered.length }, (_, i) => i)))
      setExpandAll(true)
    }
  }

  function toggleRow(i: number) {
    setExpandedIdxSet(prev => {
      const next = new Set(prev)
      if (next.has(i)) { next.delete(i) } else { next.add(i) }
      return next
    })
    setExpandAll(false)
  }

  return (
    <div className="flex flex-col h-full gap-3">

      {/* ── Row 1: Title + stats + live/pause ─────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap">
        <div className="mr-1">
          <h1 className="text-xl font-bold leading-none">Monitor</h1>
          <p className="text-xs text-muted-foreground mt-0.5">อัปเดต {updatedStr}</p>
        </div>
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
        <div className="flex-1" />
        <span className={`text-xs font-medium ${paused ? 'text-muted-foreground' : 'text-green-500'}`}>
          ● {paused ? 'Paused' : 'Live'}
        </span>
        <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={() => setPaused(v => !v)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {/* ── Row 2: Session dropdown + filters + search + autoscroll ──────── */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap">
        {/* Session dropdown */}
        <select
          aria-label="เลือก session"
          value={selectedKey ?? ''}
          onChange={e => { setSelectedKey(e.target.value || null); setExpandedIdxSet(new Set()); setExpandAll(false); setReplayOpen(false) }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-0 max-w-[260px] truncate"
        >
          <option value="">📡 ทุก session ({groups.length})</option>
          {groups.map(g => {
            const st = stateInfo(g.state)
            const ch = g.channel === 'telegram' ? 'tg' : g.channel === 'line' ? 'line' : 'web'
            const elapsed = (g.state === 'thinking' || g.state === 'tool_call') && g.elapsed > 0 ? ` ${g.elapsed}s` : ''
            return (
              <option key={g.sessionKey} value={g.sessionKey}>
                {st.label}{elapsed} · {g.agentId} · {ch} · {g.user.replace('direct:', '')}
              </option>
            )
          })}
        </select>

        {/* Full Replay button — only when specific session selected */}
        {effectiveKey && (
          <Button
            size="sm"
            variant={replayOpen ? 'default' : 'outline'}
            className="h-8 text-xs px-2.5"
            onClick={() => setReplayOpen(v => !v)}
          >
            📋 {replayOpen ? 'ปิด Replay' : 'Full Replay'}
          </Button>
        )}

        {/* Filter pills */}
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
          className="w-32 h-8 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto scroll
        </label>
        {!replayOpen && filtered.length > 0 && (
          <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={handleToggleExpandAll}>
            {expandAll ? '▲ Collapse All' : '▼ Expand All'}
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} events{filtered.length !== events.length ? ` / ${events.length}` : ''}
        </span>
      </div>

      {/* ── Full Replay Panel ─────────────────────────────────────────── */}
      {replayOpen && effectiveKey && (
        <div className="flex-1 min-h-0 border rounded-xl bg-zinc-950 font-mono text-xs overflow-y-auto p-3 space-y-3">
          {replayLoading && <p className="text-zinc-500 text-center py-8">กำลังโหลด full session...</p>}
          {!replayLoading && !replayData && (
            <p className="text-zinc-500 text-center py-8">ไม่พบ session ID — กรุณารอสักครู่</p>
          )}
          {replayData && (
            <>
              {/* Stats bar */}
              <div className="flex gap-3 text-zinc-500 text-xs border-b border-zinc-800 pb-2 flex-wrap">
                <span>{replayData.stats.turns} turns</span>
                <span>in: {replayData.stats.inputTokens.toLocaleString()}</span>
                <span>out: {replayData.stats.outputTokens.toLocaleString()}</span>
                <span className="text-yellow-500">${replayData.stats.totalCost.toFixed(4)}</span>
                <span>avg {replayData.stats.avgLatency}s</span>
              </div>
              {/* Messages */}
              {replayData.messages.map((msg, mi) => (
                <div key={mi} className={`rounded p-2 ${msg.role === 'user' ? 'bg-zinc-900 border border-zinc-800' : 'bg-zinc-950'}`}>
                  <div className="flex gap-2 items-center mb-1 text-zinc-500">
                    <span className={msg.role === 'user' ? 'text-blue-400' : 'text-green-400'}>{msg.role === 'user' ? '👤 User' : '🤖 Agent'}</span>
                    <span>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
                    {msg.latency != null && <span className={durationColor(msg.latency)}>{msg.latency}s</span>}
                    {msg.usage && (
                      <>
                        <span>↑{msg.usage.input.toLocaleString()}</span>
                        <span>↓{msg.usage.output.toLocaleString()}</span>
                        <span className="text-yellow-500">${msg.usage.cost.toFixed(4)}</span>
                      </>
                    )}
                    {msg.model && <span className="truncate max-w-32 text-zinc-600">{msg.model}</span>}
                  </div>
                  {msg.thinking && (
                    <details className="mb-1">
                      <summary className="text-yellow-600 cursor-pointer text-xs">💭 Thinking</summary>
                      <pre className="mt-1 text-yellow-200/70 whitespace-pre-wrap break-all leading-relaxed text-xs">{msg.thinking}</pre>
                    </details>
                  )}
                  {msg.toolCalls && msg.toolCalls.length > 0 && msg.toolCalls.map((tc, ti) => (
                    <details key={ti} className="mb-1">
                      <summary className="text-purple-400 cursor-pointer text-xs">🔧 {tc.name}</summary>
                      <pre className="mt-1 text-purple-200/70 whitespace-pre-wrap break-all text-xs">Input: {JSON.stringify(tc.input, null, 2)}</pre>
                      {tc.result && <pre className="mt-1 text-zinc-400 whitespace-pre-wrap break-all text-xs">Result: {tc.result}</pre>}
                    </details>
                  ))}
                  {msg.text && <pre className="text-zinc-200 whitespace-pre-wrap break-all leading-relaxed">{msg.text}</pre>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Log panel — fills remaining height ───────────────────────────── */}
      {!replayOpen && (
      <div className="flex-1 min-h-0 border rounded-xl bg-zinc-950 font-mono text-xs overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="text-zinc-600 text-center py-12">ไม่มีข้อมูล</p>
        ) : (
          filtered.map((e, i) => {
            const badge = typeBadge(e.type)
            const isExp = expandedIdxSet.has(i)
            let rowCls = 'hover:bg-zinc-900'
            if (e.isLive)                   rowCls = 'row-live'
            else if (e.type === 'thinking') rowCls = isExp ? 'bg-yellow-950/30' : 'bg-yellow-950/15 hover:bg-yellow-950/25'
            else if (e.type === 'tool')     rowCls = isExp ? 'bg-purple-950/30' : 'bg-purple-950/15 hover:bg-purple-950/25'
            else if (e.type === 'error')    rowCls = isExp ? 'bg-red-950/35' : 'bg-red-950/20 hover:bg-red-950/30'
            else if (isExp)                 rowCls = 'bg-zinc-800'

            let expandText = e.text
            if (e.type === 'tool') {
              const colonIdx = e.text.indexOf(': ')
              if (colonIdx !== -1) {
                try {
                  const parsed = JSON.parse(e.text.slice(colonIdx + 2))
                  expandText = e.text.slice(0, colonIdx) + ':\n' + JSON.stringify(parsed, null, 2)
                } catch { /* keep original */ }
              }
            }

            return (
              <div
                key={i}
                className={`rounded transition-colors cursor-pointer select-text ${rowCls}`}
                onClick={() => toggleRow(i)}
              >
                <div className="flex items-start px-2 py-0.5 leading-5">
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
                  <span className={`flex-1 text-zinc-300 ${isExp ? '' : 'truncate'}`} title={isExp ? undefined : e.text}>
                    {isExp ? null : e.text}
                    {e.isLive && <span className="thinking-dots ml-0.5 text-yellow-400" />}
                  </span>
                  {e.type === 'reply' && (e.latency != null || e.inputTokens) && (
                    <span className="shrink-0 flex gap-1.5 items-center text-zinc-600 text-xs ml-1">
                      {e.latency != null && <span className={durationColor(e.latency)}>{e.latency}s</span>}
                      {e.inputTokens ? <span title={`In: ${e.inputTokens?.toLocaleString()} Out: ${e.outputTokens?.toLocaleString()}`}>{(((e.inputTokens ?? 0) + (e.outputTokens ?? 0)) / 1000).toFixed(1)}K</span> : null}
                      {e.cost ? <span className="text-yellow-600">${e.cost.toFixed(4)}</span> : null}
                    </span>
                  )}
                  {e.type === 'reply' && e.responseDuration != null && (
                    <span className={`shrink-0 w-12 text-right ${durationColor(e.responseDuration)}`}>
                      {e.responseDuration.toFixed(1)}s
                    </span>
                  )}
                  <span className="shrink-0 w-4 text-right text-zinc-600">{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <pre className="px-2 pb-2 pt-0.5 text-zinc-200 whitespace-pre-wrap break-all leading-relaxed border-t border-zinc-800 ml-20">
                    {expandText}
                    {e.type === 'tool' && e.toolResult && (
                      <span className="block mt-2 pt-2 border-t border-zinc-700 text-zinc-400">
                        {'↩ Result:\n'}{e.toolResult}
                      </span>
                    )}
                  </pre>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      )}

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
