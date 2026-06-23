'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Image as ImageIcon, Pause, Play } from 'lucide-react'
import { getMonitorEvents, getSessionReplay, type MonitorData, type MonitorEvent, type MonitorMedia } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ─── Time helpers ──────────────────────────────────────────────────────────────
function legacyTsToThai(ts: string): string {
  if (!ts) return ''
  const parts = ts.split(':')
  if (parts.length < 3) return ts
  let h = parseInt(parts[0]) + 7
  const m = parts[1]
  const s = parts[2].slice(0, 2)
  if (h >= 24) h -= 24
  return `${String(h).padStart(2, '0')}:${m}:${s}`
}

function legacyTsToSec(ts: string): number {
  const p = ts.split(':')
  if (p.length < 3) return 0
  return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2])
}

function formatBangkokTime(ms: number, includeDate: boolean): string {
  const date = new Date(ms)
  return date.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    ...(includeDate ? { day: '2-digit', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function bangkokDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FlatEvent {
  ts: string
  tsThai: string
  timestamp?: string | null
  timeMs?: number | null
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
  model?: string | null
  provider?: string | null
  modelSource?: 'actual' | 'configured' | string | null
  finishReason?: string | null
  toolName?: string
  toolInput?: string
  toolResult?: string
  cleanKeyword?: string
  intent?: string
  route?: string
  turnTotalCost?: number  // ยอดรวม cost ทั้ง turn (message -> reply)
  turnModelCalls?: number
  turnInputTokens?: number
  turnOutputTokens?: number
  media?: MonitorMedia[]
  marker?: string
  method?: string
  deliveryMethod?: string
  accountId?: string
  chatType?: string
  messageCount?: number | null
  durationMs?: number | null
  replyTokenAgeMs?: number | null
  fallbackReason?: string | null
  loadingSeconds?: number | null
  eventCount?: number | null
}

function eventTimeMs(e: Pick<FlatEvent, 'timeMs' | 'timestamp' | 'ts'>): number | null {
  if (typeof e.timeMs === 'number' && Number.isFinite(e.timeMs)) return e.timeMs
  if (e.timestamp) {
    const parsed = new Date(e.timestamp).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  if (e.ts) return legacyTsToSec(e.ts) * 1000
  return null
}

function eventDayKey(e: Pick<FlatEvent, 'timeMs' | 'timestamp' | 'ts'>): string | null {
  const ms = eventTimeMs(e)
  if (ms == null || !e.timestamp) return null
  return bangkokDayKey(ms)
}

function formatEventTime(e: FlatEvent, includeDate: boolean): string {
  const ms = eventTimeMs(e)
  if (ms != null && e.timestamp) return formatBangkokTime(ms, includeDate)
  return e.tsThai || legacyTsToThai(e.ts)
}

interface SessionGroup {
  sessionKey: string
  agentId: string
  channel: 'webchat' | 'telegram' | 'line'
  user: string
  state: string
  lastMessageAt: string | null
  elapsed: number
  sessionCost: number
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

function isNoiseEvent(e: FlatEvent) {
  const text = `${e.type} ${e.text} ${e.toolName ?? ''}`.toLowerCase()
  return text.includes('delivery-mirror') ||
    text.includes('tool-policy removed') ||
    text.includes('allowlist contains unknown entries')
}

function typeBadge(type: string) {
  switch (type) {
    case 'message':  return { icon: '📩', cls: 'text-zinc-400' }
    case 'thinking': return { icon: '💭', cls: 'text-yellow-500' }
    case 'tool':     return { icon: '🔧', cls: 'text-purple-400' }
    case 'reply':    return { icon: '✅', cls: 'text-green-400' }
    case 'warning':  return { icon: '⚠', cls: 'text-amber-400' }
    case 'error':    return { icon: '❌', cls: 'text-red-400' }
    case 'line_delivery': return { icon: 'LINE', cls: 'text-emerald-400' }
    case 'line_loading':  return { icon: '⏳', cls: 'text-cyan-300' }
    case 'line_fallback': return { icon: '↪', cls: 'text-amber-300' }
    default:         return { icon: '·',  cls: 'text-zinc-600' }
  }
}

function hasUsageMetrics(e: Pick<FlatEvent, 'cost' | 'inputTokens' | 'outputTokens'>) {
  return e.cost != null || e.inputTokens != null || e.outputTokens != null
}

function formatTokenK(inputTokens?: number, outputTokens?: number) {
  return (((inputTokens ?? 0) + (outputTokens ?? 0)) / 1000).toFixed(1)
}

function compactModel(value?: string | null) {
  if (!value) return ''
  return value
    .replace(/^openrouter\//, '')
    .replace(/^google\//, 'google/')
    .replace(/^openai\//, 'openai/')
}

function modelTitle(e: Pick<FlatEvent, 'model' | 'provider' | 'modelSource' | 'finishReason'>) {
  const parts = [
    e.model ? `Model: ${e.model}` : null,
    e.provider ? `Provider: ${e.provider}` : null,
    e.modelSource ? `Source: ${e.modelSource}` : null,
    e.finishReason ? `Finish: ${e.finishReason}` : null,
  ].filter(Boolean)
  return parts.join('\n')
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
  return `${Math.round(value / (1024 * 102.4)) / 10} MB`
}

function monitorMediaUrl(media: MonitorMedia) {
  if (!media.hasPreview) return ''
  if (media.previewUrl?.startsWith('/api/')) return `/api/proxy${media.previewUrl}`
  if (media.id) return `/api/proxy/api/monitor/media/${encodeURIComponent(media.id)}`
  return ''
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
        let lastMsgMs: number | null = null
        const events: FlatEvent[] = []

        const evList = session.events as MonitorEvent[]
        let turnCost = 0
        let turnModelCalls = 0
        let turnInputTokens = 0
        let turnOutputTokens = 0
        for (let i = 0; i < evList.length; i++) {
          const e = evList[i]
          const isLast = i === evList.length - 1
          const eventInputTokens = (e as MonitorEvent).inputTokens
          const eventOutputTokens = (e as MonitorEvent).outputTokens
          const eventCost = (e as MonitorEvent).cost
          const eventHasUsage = hasUsageMetrics({ cost: eventCost, inputTokens: eventInputTokens, outputTokens: eventOutputTokens })
          const currentMs = eventTimeMs({
            ts: e.ts,
            timestamp: (e as MonitorEvent).timestamp,
            timeMs: (e as MonitorEvent).timeMs,
          })
          let responseDuration: number | undefined

          if (e.type === 'message') {
            lastMsgMs = currentMs
            turnCost = 0
            turnModelCalls = 0
            turnInputTokens = 0
            turnOutputTokens = 0
          } else if (e.type === 'reply' && lastMsgMs != null && currentMs != null) {
            const real = (currentMs - lastMsgMs) / 1000
            if (real >= 0 && real < 3600) responseDuration = real
            lastMsgMs = null
          }

          // สะสม usage ทุก LLM call ในรอบนี้; deterministic tool-only events ไม่มี usage/model จึงไม่ถูกนับ
          if (e.type !== 'message' && eventHasUsage) {
            turnModelCalls += 1
            turnInputTokens += eventInputTokens ?? 0
            turnOutputTokens += eventOutputTokens ?? 0
            turnCost += eventCost ?? 0
          }

          events.push({
            ts: e.ts,
            tsThai: legacyTsToThai(e.ts),
            timestamp: (e as MonitorEvent).timestamp ?? null,
            timeMs: (e as MonitorEvent).timeMs ?? null,
            type: e.type,
            text: e.text,
            agentId: agent.id, channel: ch, user: session.user,
            sessionKey: session.sessionKey, isLive: isActive && isLast, responseDuration,
            latency: (e as MonitorEvent).latency,
            inputTokens: eventInputTokens,
            outputTokens: eventOutputTokens,
            cost: eventCost,
            model: (e as MonitorEvent).model,
            provider: (e as MonitorEvent).provider,
            modelSource: (e as MonitorEvent).modelSource,
            finishReason: (e as MonitorEvent).finishReason,
            toolName: (e as MonitorEvent).toolName,
            toolInput: (e as MonitorEvent).toolInput,
            toolResult: (e as MonitorEvent).toolResult,
            cleanKeyword: (e as MonitorEvent).cleanKeyword,
            intent: (e as MonitorEvent).intent,
            route: (e as MonitorEvent).route,
            media: (e as MonitorEvent).media,
            marker: (e as MonitorEvent).marker,
            method: (e as MonitorEvent).method,
            deliveryMethod: (e as MonitorEvent).deliveryMethod,
            accountId: (e as MonitorEvent).accountId,
            chatType: (e as MonitorEvent).chatType,
            messageCount: (e as MonitorEvent).messageCount,
            durationMs: (e as MonitorEvent).durationMs,
            replyTokenAgeMs: (e as MonitorEvent).replyTokenAgeMs,
            fallbackReason: (e as MonitorEvent).fallbackReason,
            loadingSeconds: (e as MonitorEvent).loadingSeconds,
            eventCount: (e as MonitorEvent).eventCount,
            turnTotalCost: e.type === 'reply' && turnModelCalls > 0 ? turnCost : undefined,
            turnModelCalls: e.type === 'reply' && turnModelCalls > 0 ? turnModelCalls : undefined,
            turnInputTokens: e.type === 'reply' && turnModelCalls > 0 ? turnInputTokens : undefined,
            turnOutputTokens: e.type === 'reply' && turnModelCalls > 0 ? turnOutputTokens : undefined,
          })
        }

        groups.push({
          sessionKey: session.sessionKey, agentId: agent.id, channel: ch,
          user: session.user, state: session.state,
          lastMessageAt: session.lastMessageAt, elapsed: session.elapsed ?? 0,
          sessionCost: session.cost ?? 0,
          events,
        })
      }
    }
  }

  const lineTelemetryEvents = (data.globalEvents ?? [])
    .filter(event => String(event.type || '').startsWith('line_'))
    .map((event): FlatEvent => ({
      ts: event.ts,
      tsThai: legacyTsToThai(event.ts),
      timestamp: event.timestamp ?? null,
      timeMs: event.timeMs ?? null,
      type: event.type,
      text: event.text,
      agentId: event.agentId || 'gateway',
      channel: 'line',
      user: event.user || event.accountId || 'line',
      sessionKey: 'gateway-line-telemetry',
      isLive: false,
      latency: typeof event.durationMs === 'number' ? Math.round(event.durationMs / 100) / 10 : undefined,
      marker: event.marker,
      method: event.method,
      deliveryMethod: event.deliveryMethod,
      accountId: event.accountId,
      chatType: event.chatType,
      messageCount: event.messageCount,
      durationMs: event.durationMs,
      replyTokenAgeMs: event.replyTokenAgeMs,
      fallbackReason: event.fallbackReason,
      loadingSeconds: event.loadingSeconds,
      eventCount: event.eventCount,
    }))

  if (lineTelemetryEvents.length > 0) {
    groups.push({
      sessionKey: 'gateway-line-telemetry',
      agentId: 'gateway',
      channel: 'line',
      user: 'line delivery',
      state: lineTelemetryEvents.some(event => event.type === 'line_delivery' && /failed/i.test(event.text)) ? 'error' : 'replied',
      lastMessageAt: lineTelemetryEvents[0]?.timestamp ?? null,
      elapsed: 0,
      sessionCost: 0,
      events: lineTelemetryEvents,
    })
  }

  return groups.sort((a, b) => {
    const o = (s: string) => (s === 'thinking' || s === 'tool_call' ? 0 : s === 'replied' ? 1 : s === 'error' ? 2 : 3)
    const d = o(a.state) - o(b.state)
    if (d !== 0) return d
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
  })
}

function NoiseToggle({ hiddenCount, checked, onChange }: { hiddenCount: number; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      Show noise
      {hiddenCount > 0 && (
        <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-500">
          {hiddenCount} hidden
        </span>
      )}
    </label>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const [paused, setPaused] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'line' | 'telegram' | 'webchat'>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const [showNoise, setShowNoise] = useState(false)
  const [expandedIdxSet, setExpandedIdxSet] = useState<Set<number>>(new Set())
  const [expandAll, setExpandAll] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<{ media: MonitorMedia; event: FlatEvent } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ข้อ 2: adaptive refresh — เร็วขึ้นเมื่อมี active session
  const [activeCountForRefetch, setActiveCountForRefetch] = useState(0)
  const refetchInterval = paused ? false : activeCountForRefetch > 0 ? 1500 : 5000

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['monitor'],
    queryFn: getMonitorEvents,
    refetchInterval,
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

  // sync activeCount → refetch interval
  useEffect(() => {
    setActiveCountForRefetch(activeCount)
  }, [activeCount])

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
    events.sort((a, b) => (eventTimeMs(a) ?? 0) - (eventTimeMs(b) ?? 0))
  } else {
    const g = groups.find(g => g.sessionKey === effectiveKey)
    if (g) events = g.events
  }

  const q = search.toLowerCase()
  const filteredWithNoise = events.filter(e => {
    // ข้อ 1: channel filter
    if (channelFilter !== 'ALL' && e.channel !== channelFilter) return false
    if (stateFilter !== 'ALL') {
      const typeMap: Record<string, string[]> = {
        thinking: ['thinking'], tool: ['tool'], replied: ['reply'], error: ['error'], message: ['message'],
        warning: ['warning'],
      }
      if (!(typeMap[stateFilter] ?? []).includes(e.type)) return false
    }
    if (q) {
      const mediaText = (e.media ?? []).map(media => `${media.fileName ?? ''} ${media.caption ?? ''} ${media.mimeType ?? ''}`).join(' ')
      return e.text.toLowerCase().includes(q) || e.agentId.includes(q) || e.user.includes(q) || mediaText.toLowerCase().includes(q)
    }
    return true
  })
  const hiddenNoiseCount = filteredWithNoise.filter(isNoiseEvent).length
  const filtered = showNoise ? filteredWithNoise : filteredWithNoise.filter(e => !isNoiseEvent(e))
  const visibleDayCount = new Set(filtered.map(eventDayKey).filter(Boolean)).size
  const showEventDates = visibleDayCount > 1

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
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
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
            const costStr = g.sessionCost > 0 ? ` $${g.sessionCost.toFixed(4)}` : ''
            return (
              <option key={g.sessionKey} value={g.sessionKey}>
                {st.label}{elapsed} · {g.agentId} · {ch} · {g.user.replace('direct:', '')}{costStr}
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

        {/* Channel filter — ข้อ 1 */}
        <div className="flex gap-1 flex-wrap">
          {([
            { id: 'ALL',      label: 'ทุก channel' },
            { id: 'line',     label: '📱 LINE' },
            { id: 'telegram', label: '✈️ Telegram' },
            { id: 'webchat',  label: '💬 Webchat' },
          ] as { id: 'ALL' | 'line' | 'telegram' | 'webchat'; label: string }[]).map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setChannelFilter(s.id); setExpandedIdxSet(new Set()); setExpandAll(false) }}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                channelFilter === s.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-input text-muted-foreground hover:border-foreground/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Event type filter pills */}
        <div className="flex gap-1 flex-wrap">
          {[
            { id: 'ALL',      label: 'ทั้งหมด' },
            { id: 'message',  label: '📩 msg' },
            { id: 'thinking', label: '💭 think' },
            { id: 'tool',     label: '🔧 tool' },
            { id: 'warning',  label: '⚠ warn' },
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
        <NoiseToggle hiddenCount={hiddenNoiseCount} checked={showNoise} onChange={setShowNoise} />
        {!replayOpen && filtered.length > 0 && (
          <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={handleToggleExpandAll}>
            {expandAll ? '▲ Collapse All' : '▼ Expand All'}
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} events{filtered.length !== events.length ? ` / ${events.length}` : ''}
          {selectedGroup && selectedGroup.sessionCost > 0 && (
            <span className="ml-2 text-yellow-500 font-medium" title="Total cost ของ session นี้">
              💰 ${selectedGroup.sessionCost.toFixed(4)}
            </span>
          )}
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
              {replayData.warnings && replayData.warnings.length > 0 && (
                <div className="rounded border border-amber-800 bg-amber-950/40 p-2 text-amber-200">
                  {replayData.warnings.map((w, i) => (
                    <p key={i} className="break-all">{w.summary}</p>
                  ))}
                </div>
              )}
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
                    {msg.model && (
                      <span className="max-w-56 truncate rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-500" title={`${msg.provider ? `${msg.provider} · ` : ''}${msg.model}`}>
                        {compactModel(msg.model)}
                      </span>
                    )}
                    {msg.stopReason && <span className="text-zinc-600">finish: {msg.stopReason}</span>}
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
            else if (e.type === 'warning')  rowCls = isExp ? 'bg-amber-950/35' : 'bg-amber-950/20 hover:bg-amber-950/30'
            else if (e.type === 'error')    rowCls = isExp ? 'bg-red-950/35' : 'bg-red-950/20 hover:bg-red-950/30'
            else if (e.type === 'line_delivery') rowCls = isExp ? 'bg-emerald-950/25' : 'bg-emerald-950/10 hover:bg-emerald-950/20'
            else if (e.type === 'line_loading') rowCls = isExp ? 'bg-cyan-950/25' : 'bg-cyan-950/10 hover:bg-cyan-950/20'
            else if (e.type === 'line_fallback') rowCls = isExp ? 'bg-amber-950/35' : 'bg-amber-950/20 hover:bg-amber-950/30'
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
            const toolMetaText = e.type === 'tool'
              ? [
                  e.route ? `route: ${e.route}` : null,
                  e.intent ? `intent: ${e.intent}` : null,
                  e.cleanKeyword ? `cleanKeyword: ${e.cleanKeyword}` : null,
                  e.toolInput ? `Input:\n${e.toolInput}` : null,
                ].filter(Boolean).join('\n\n')
              : ''
            const modelMetaText = e.model
              ? [
                  `Model: ${e.model}`,
                  e.provider ? `Provider: ${e.provider}` : null,
                  e.modelSource ? `Model source: ${e.modelSource}` : null,
                  e.finishReason ? `Finish reason: ${e.finishReason}` : null,
                  e.inputTokens != null ? `Input tokens: ${e.inputTokens.toLocaleString()}` : null,
                  e.outputTokens != null ? `Output tokens: ${e.outputTokens.toLocaleString()}` : null,
                  e.cost != null ? `Cost: $${e.cost.toFixed(6)}` : null,
                ].filter(Boolean).join('\n')
              : ''
            const lineMetaText = e.type.startsWith('line_')
              ? [
                  e.accountId ? `LINE account: ${e.accountId}` : null,
                  e.method ? `Method: ${e.method}` : null,
                  e.chatType ? `Chat type: ${e.chatType}` : null,
                  e.messageCount != null ? `Message objects: ${e.messageCount}` : null,
                  e.eventCount != null ? `Webhook events: ${e.eventCount}` : null,
                  e.loadingSeconds != null ? `Loading seconds: ${e.loadingSeconds}` : null,
                  e.durationMs != null ? `Duration: ${e.durationMs}ms` : null,
                  e.replyTokenAgeMs != null ? `Reply token age: ${e.replyTokenAgeMs}ms` : null,
                  e.fallbackReason ? `Fallback reason: ${e.fallbackReason}` : null,
                  e.marker ? `Marker: ${e.marker}` : null,
                ].filter(Boolean).join('\n')
              : ''
            const expandedBody = [expandText, lineMetaText, modelMetaText, toolMetaText].filter(Boolean).join('\n\n')

            return (
              <div
                key={i}
                className={`rounded transition-colors cursor-pointer select-text ${rowCls}`}
                onClick={() => toggleRow(i)}
              >
                <div className="flex items-start px-2 py-0.5 leading-5">
                  <span className={`shrink-0 text-zinc-600 ${showEventDates ? 'w-32' : 'w-20'}`}>
                    {formatEventTime(e, showEventDates)}
                  </span>
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
                  <span className={`flex-1 text-zinc-300 min-w-0 ${isExp ? '' : 'truncate'}`} title={isExp ? undefined : e.text}>
                    {isExp ? null : (
                      e.type === 'tool' && e.toolName
                        ? <><span className="text-purple-300 font-medium">{e.toolName}</span>{e.text && e.text !== 'exec' ? <span className="text-zinc-500 ml-1 text-xs">{e.text}</span> : null}</>
                        : e.text
                    )}
                    {e.isLive && <span className="thinking-dots ml-0.5 text-yellow-400" />}
                  </span>
                  {e.media?.length ? (
                    <span className="ml-1 hidden shrink-0 items-center gap-1 rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-cyan-300 sm:inline-flex">
                      <ImageIcon className="size-3" />
                      รูป {e.media.length}
                    </span>
                  ) : null}
                  {e.type.startsWith('line_') && e.method ? (
                    <span className={`ml-1 hidden shrink-0 rounded border px-1.5 py-0.5 text-[11px] sm:inline ${e.type === 'line_fallback' ? 'border-amber-800 text-amber-300' : e.method === 'loading' ? 'border-cyan-800 text-cyan-300' : 'border-emerald-800 text-emerald-300'}`}>
                      LINE {e.method}{e.type === 'line_fallback' ? ' fallback' : ''}
                    </span>
                  ) : null}
                  {e.model && e.type !== 'message' && (
                    <span
                      className={`ml-1 hidden max-w-44 shrink-0 truncate rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] sm:inline ${e.modelSource === 'configured' ? 'text-amber-400' : 'text-zinc-500'}`}
                      title={modelTitle(e)}
                    >
                      {compactModel(e.model)}
                    </span>
                  )}
                  {/* tool event: แสดง duration */}
                  {e.type === 'tool' && e.latency != null && (
                    <span className="shrink-0 flex gap-1.5 items-center text-zinc-600 text-xs ml-1">
                      <span className={durationColor(e.latency)}>{e.latency}s</span>
                    </span>
                  )}
                  {/* thinking event: แสดง cost ต่อ LLM call */}
                  {e.type === 'thinking' && (e.latency != null || e.cost != null || e.inputTokens != null || e.outputTokens != null) && (
                    <span className="shrink-0 flex gap-1.5 items-center text-zinc-600 text-xs ml-1">
                      {e.latency != null && <span className={durationColor(e.latency)}>{e.latency}s</span>}
                      <span className="text-zinc-500">call</span>
                      {(e.inputTokens != null || e.outputTokens != null) ? <span title={`Model call tokens - In: ${(e.inputTokens ?? 0).toLocaleString()} Out: ${(e.outputTokens ?? 0).toLocaleString()}`}>{formatTokenK(e.inputTokens, e.outputTokens)}K</span> : null}
                      {e.cost != null ? <span className="text-yellow-500/70" title="Cost ของ model call นี้">${e.cost.toFixed(4)}</span> : null}
                    </span>
                  )}
                  {/* reply event: แสดง latency + tokens + turnTotalCost (ยอดรวมทั้ง turn) */}
                  {e.type === 'reply' && (e.latency != null || e.inputTokens != null || e.outputTokens != null || e.cost != null || e.turnTotalCost != null) && (
                    <span className="shrink-0 flex gap-1.5 items-center text-zinc-600 text-xs ml-1">
                      {e.latency != null && <span className={durationColor(e.latency)}>{e.latency}s</span>}
                      {e.turnTotalCost != null
                        ? (
                          <>
                            <span className="text-zinc-500" title="จำนวน model API calls ใน turn นี้">{e.turnModelCalls} call{e.turnModelCalls === 1 ? '' : 's'}</span>
                            <span title={`Turn total tokens - In: ${(e.turnInputTokens ?? 0).toLocaleString()} Out: ${(e.turnOutputTokens ?? 0).toLocaleString()}`}>{formatTokenK(e.turnInputTokens, e.turnOutputTokens)}K</span>
                            <span className="text-yellow-400 font-medium" title={`Turn total cost: $${e.turnTotalCost.toFixed(4)}`}>turn ${e.turnTotalCost.toFixed(4)}</span>
                          </>
                        )
                        : (
                          <>
                            {(e.inputTokens != null || e.outputTokens != null) ? <span title={`Model call tokens - In: ${(e.inputTokens ?? 0).toLocaleString()} Out: ${(e.outputTokens ?? 0).toLocaleString()}`}>{formatTokenK(e.inputTokens, e.outputTokens)}K</span> : null}
                            {e.cost != null ? <span className="text-yellow-600" title="Cost ของ model call นี้">${e.cost.toFixed(4)}</span> : null}
                          </>
                        )
                      }
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
                  <div className={`border-t border-zinc-800 px-2 pb-2 pt-1 ${showEventDates ? 'ml-32' : 'ml-20'}`}>
                    {expandedBody ? (
                      <pre className="text-zinc-200 whitespace-pre-wrap break-all leading-relaxed">
                        {expandedBody}
                        {e.type === 'tool' && e.toolResult && (
                          <span className="block mt-2 pt-2 border-t border-zinc-700 text-zinc-400">
                            {'↩ Result:\n'}{e.toolResult}
                          </span>
                        )}
                      </pre>
                    ) : null}
                    {e.media?.length ? (
                      <div className={expandedBody ? 'mt-3 border-t border-zinc-800 pt-3' : 'pt-1'}>
                        <div className="mb-2 flex items-center gap-2 text-xs text-cyan-300">
                          <ImageIcon className="size-3.5" />
                          media {e.media.length}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {e.media.map((media, mediaIndex) => {
                            const src = monitorMediaUrl(media)
                            return (
                              <div key={`${media.id ?? media.fileName ?? mediaIndex}`} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                                {src ? (
                                  <button
                                    type="button"
                                    className="block w-full overflow-hidden rounded border border-zinc-800 bg-black text-left"
                                    onClick={event => {
                                      event.stopPropagation()
                                      setSelectedMedia({ media, event: e })
                                    }}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt={media.fileName || 'monitor media preview'} className="h-28 w-full object-cover" loading="lazy" />
                                  </button>
                                ) : (
                                  <div className="flex h-28 items-center justify-center rounded border border-dashed border-zinc-700 bg-zinc-950 p-3 text-center text-xs text-zinc-500">
                                    มี media แต่ไม่มีไฟล์ preview ใน log นี้
                                  </div>
                                )}
                                <div className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
                                  <p className="truncate text-zinc-300">{media.fileName || media.mimeType || 'media'}</p>
                                  <p>{media.mimeType || 'unknown'} {formatBytes(media.sizeBytes)}</p>
                                  {media.caption ? <p className="line-clamp-2 text-zinc-400">{media.caption}</p> : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      )}

      <Dialog open={Boolean(selectedMedia)} onOpenChange={open => { if (!open) setSelectedMedia(null) }}>
        <DialogContent className="max-w-5xl bg-zinc-950 text-zinc-100 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Media preview</DialogTitle>
          </DialogHeader>
          {selectedMedia ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={monitorMediaUrl(selectedMedia.media)}
                  alt={selectedMedia.media.fileName || 'monitor media preview'}
                  className="max-h-[72vh] w-auto max-w-full object-contain"
                />
              </div>
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">เวลา</p>
                  <p>{formatEventTime(selectedMedia.event, true)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Channel</p>
                  <p>{selectedMedia.event.channel} · {selectedMedia.event.agentId}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">ไฟล์</p>
                  <p className="break-all">{selectedMedia.media.fileName || '(no file name)'}</p>
                  <p className="text-xs text-zinc-500">{selectedMedia.media.mimeType || 'unknown'} {formatBytes(selectedMedia.media.sizeBytes)}</p>
                </div>
                {selectedMedia.media.caption ? (
                  <div>
                    <p className="text-xs text-zinc-500">Caption</p>
                    <p className="whitespace-pre-wrap">{selectedMedia.media.caption}</p>
                  </div>
                ) : null}
                <p className="text-xs leading-relaxed text-zinc-500">
                  Preview นี้โหลดผ่าน API ที่ตรวจ allowlist แล้วเท่านั้น และไม่แสดง path หรือ Telegram file id ฝั่งหน้าเว็บ
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

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
