'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gauge,
  MessageSquare,
  Pause,
  Play,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import {
  getMonitorConversations,
  getMonitorLatency,
  getSessionReplay,
  type MonitorConversationTurn,
  type MonitorLatencyData,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ChannelFilter = 'ALL' | 'telegram' | 'line' | 'webchat'
type RouteFilter = 'ALL' | 'tool_path' | 'model_path' | 'capability_denied' | 'native'

function msText(ms: number | null | undefined) {
  if (ms == null) return '-'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

function turnTimeLabel(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function routeLabel(route: string) {
  switch (route) {
    case 'tool_path': return 'Tool path'
    case 'model_path': return 'Model path'
    case 'capability_denied': return 'Denied'
    case 'native': return 'Native'
    case 'quality_fallback': return 'Quality fallback'
    default: return route || '-'
  }
}

function routeClass(route: string) {
  switch (route) {
    case 'tool_path': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    case 'model_path': return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
    case 'capability_denied': return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'native': return 'border-zinc-600 bg-zinc-800 text-zinc-200'
    case 'quality_fallback': return 'border-purple-500/30 bg-purple-500/10 text-purple-300'
    default: return 'border-zinc-700 bg-zinc-900 text-zinc-300'
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'ok': return 'text-emerald-300'
    case 'pending': return 'text-yellow-300'
    case 'warn': return 'text-amber-300'
    case 'error': return 'text-red-300'
    default: return 'text-zinc-400'
  }
}

function durationClass(ms: number | null | undefined) {
  if (ms == null) return 'text-zinc-500'
  if (ms <= 5000) return 'text-emerald-300'
  if (ms <= 10000) return 'text-yellow-300'
  return 'text-red-300'
}

function compactText(value: string, fallback: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text || fallback
}

function turnMatchesQuery(turn: MonitorConversationTurn, query: string) {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    turn.agentId,
    turn.channel,
    turn.user,
    turn.intent,
    turn.route,
    turn.userText,
    turn.finalText,
    ...turn.toolPath.map(tool => `${tool.name} ${tool.resultSummary ?? ''}`),
  ].filter(Boolean).some(value => String(value).toLowerCase().includes(q))
}

function SummaryCard({ label, value, sub, tone = 'text-zinc-100' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-h-[72px] rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold leading-none ${tone}`}>{value}</p>
      {sub && <p className="mt-1 truncate text-[11px] text-zinc-500">{sub}</p>}
    </div>
  )
}

function ConversationTurnCard({
  turn,
  expanded,
  onToggle,
  onReplay,
}: {
  turn: MonitorConversationTurn
  expanded: boolean
  onToggle: () => void
  onReplay: () => void
}) {
  const hasTools = turn.toolPath.length > 0
  const hasWarnings = turn.warnings.length > 0
  const canReplay = turn.source === 'session' && Boolean(turn.sessionKey && turn.agentId)
  const userText = compactText(turn.userText, '(no user text captured)')
  const finalText = compactText(turn.finalText, turn.status === 'pending' ? 'ยังไม่มีคำตอบสุดท้าย' : '(no final reply captured)')

  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-zinc-900/60"
      >
        <span className="mt-0.5 text-zinc-500">
          {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-zinc-500">{turnTimeLabel(turn.startedAt)}</span>
            <span className={`rounded border px-2 py-0.5 text-[11px] ${routeClass(turn.route)}`}>{routeLabel(turn.route)}</span>
            <span className={`text-xs font-medium ${statusClass(turn.status)}`}>{turn.status}</span>
            <span className={`text-xs ${durationClass(turn.durationMs)}`}>{msText(turn.durationMs)}</span>
            {hasTools && (
              <span className="inline-flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-200">
                <Wrench className="h-3 w-3" aria-hidden="true" />
                {turn.toolPath.map(tool => tool.name).join(' -> ')}
              </span>
            )}
            {hasWarnings && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {turn.warnings.length} warning
              </span>
            )}
          </div>
          <div className="mt-2 grid gap-2 min-[980px]:grid-cols-2">
            <div className="min-w-0 rounded-md bg-zinc-900/70 px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                User
              </div>
              <p className="break-words text-sm leading-relaxed text-zinc-100">{userText}</p>
            </div>
            <div className="min-w-0 rounded-md bg-zinc-900/70 px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                Agent
              </div>
              <p className="break-words text-sm leading-relaxed text-zinc-200">{finalText}</p>
            </div>
          </div>
        </div>
        <div className="hidden min-w-[120px] text-right text-xs text-zinc-500 min-[760px]:block">
          <div>{turn.agentId ?? '-'}</div>
          <div>{turn.channel}</div>
          <div className="truncate">{turn.user}</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-3">
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-3">
              <div>
                <h3 className="mb-1 text-xs font-semibold text-zinc-300">Decision trace</h3>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded border border-zinc-800 px-2 py-1 text-zinc-300">intent: {turn.intent || 'unknown'}</span>
                  <span className="rounded border border-zinc-800 px-2 py-1 text-zinc-300">route: {routeLabel(turn.route)}</span>
                  <span className="rounded border border-zinc-800 px-2 py-1 text-zinc-300">source: {turn.source}</span>
                  {turn.rootCause && <span className="rounded border border-zinc-800 px-2 py-1 text-zinc-300">cause: {turn.rootCause}</span>}
                </div>
              </div>

              {hasTools && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-zinc-300">Tools</h3>
                  <div className="space-y-2">
                    {turn.toolPath.map((tool, index) => (
                      <div key={`${tool.name}-${index}`} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-purple-200">{tool.name}</span>
                          <span className="text-zinc-500">{tool.status ?? 'ok'}</span>
                          {tool.durationMs != null && <span className={durationClass(tool.durationMs)}>{msText(tool.durationMs)}</span>}
                        </div>
                        {tool.argsPreview && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-[11px] text-zinc-300">{tool.argsPreview}</pre>}
                        {tool.resultSummary && <p className="mt-2 break-words text-xs leading-relaxed text-zinc-400">{tool.resultSummary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasWarnings && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-amber-200">Warnings</h3>
                  <div className="space-y-1">
                    {turn.warnings.map((warning, index) => (
                      <div key={`${warning.type}-${index}`} className="rounded-md border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 text-xs text-amber-100">
                        {warning.summary}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <span>Agent</span>
                <span className="truncate text-zinc-200">{turn.agentId ?? '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Channel</span>
                <span className="text-zinc-200">{turn.channel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Duration</span>
                <span className={durationClass(turn.durationMs)}>{msText(turn.durationMs)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Model</span>
                <span className="text-zinc-200">{msText(turn.modelMs)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Ack</span>
                <span className="text-zinc-200">{msText(turn.ackMs)}</span>
              </div>
              {canReplay && (
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onReplay}>
                  Open session replay
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function LatencyDiagnostics({ data }: { data?: MonitorLatencyData }) {
  const summary = data?.summary
  const slowest = data?.slowest ?? []
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="h-4 w-4 text-zinc-300" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-zinc-100">Telegram diagnostics</h2>
        <span className="text-xs text-zinc-500">{data?.windowMinutes ?? 60} min</span>
      </div>
      <div className="mt-3 grid gap-2 min-[760px]:grid-cols-4">
        <SummaryCard label="ack p95" value={msText(summary?.ackP95Ms)} sub={`p50 ${msText(summary?.ackP50Ms)}`} tone={durationClass(summary?.ackP95Ms)} />
        <SummaryCard label="final p95" value={msText(summary?.finalP95Ms)} sub={`p50 ${msText(summary?.finalP50Ms)}`} tone={durationClass(summary?.finalP95Ms)} />
        <SummaryCard label="turns" value={String(summary?.count ?? 0)} sub="telemetry window" />
        <SummaryCard label="slowest" value={slowest[0] ? msText(slowest[0].finalMs) : '-'} sub={slowest[0]?.rootCause ?? 'no slow final'} />
      </div>
      {slowest.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {slowest.slice(0, 5).map(turn => (
            <div key={turn.turnId} className="grid grid-cols-[80px_1fr_80px] gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-300">
              <span className="font-mono text-zinc-500">{turnTimeLabel(turn.startedAt)}</span>
              <span className="truncate">{turn.agentId ?? '-'} · {turn.rootCause}</span>
              <span className={durationClass(turn.finalMs)}>{msText(turn.finalMs)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function MonitorPage() {
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('ALL')
  const [routeFilter, setRouteFilter] = useState<RouteFilter>('ALL')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [replayTarget, setReplayTarget] = useState<{ agentId: string; sessionKey: string } | null>(null)

  const conversationParams = useMemo(() => ({
    minutes: 180,
    limit: 120,
    ...(channelFilter !== 'ALL' ? { channel: channelFilter as Exclude<ChannelFilter, 'ALL'> } : {}),
  }), [channelFilter])
  const {
    data: conversationData,
    dataUpdatedAt,
    isLoading,
  } = useQuery({
    queryKey: ['monitor-conversations', conversationParams],
    queryFn: () => getMonitorConversations(conversationParams),
    refetchInterval: paused ? false : 3000,
  })

  const { data: latencyData, isFetching: latencyFetching } = useQuery({
    queryKey: ['monitor-latency', 'telegram', 60],
    queryFn: () => getMonitorLatency({ minutes: 60, channel: 'telegram' }),
    enabled: diagnosticsOpen,
    refetchInterval: paused ? false : 15000,
  })

  const { data: replayData, isLoading: replayLoading } = useQuery({
    queryKey: ['session-replay', replayTarget?.agentId, replayTarget?.sessionKey],
    queryFn: () => getSessionReplay(replayTarget!.agentId, replayTarget!.sessionKey),
    enabled: replayTarget !== null,
  })

  const filteredTurns = useMemo(() => {
    const turns = conversationData?.turns ?? []
    return turns.filter(turn => {
      if (routeFilter !== 'ALL' && turn.route !== routeFilter) return false
      return turnMatchesQuery(turn, search.trim())
    })
  }, [conversationData?.turns, routeFilter, search])

  const activeCount = filteredTurns.filter(turn => turn.status === 'pending').length
  const warningCount = filteredTurns.reduce((sum, turn) => sum + turn.warnings.length, 0)
  const toolPathCount = filteredTurns.filter(turn => turn.route === 'tool_path').length
  const modelPathCount = filteredTurns.filter(turn => turn.route === 'model_path').length
  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '--:--'

  function toggleTurn(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1">
            <h1 className="text-xl font-bold leading-none">Monitor</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Conversation feed · อัปเดต {updatedStr}</p>
          </div>
          <Badge variant="secondary">{conversationData?.summary.count ?? 0} turns</Badge>
          {activeCount > 0 ? (
            <Badge className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400">{activeCount} pending</Badge>
          ) : (
            <Badge variant="secondary">0 pending</Badge>
          )}
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{toolPathCount} tool path</Badge>
          <Badge className="border-blue-500/30 bg-blue-500/10 text-blue-300">{modelPathCount} model path</Badge>
          {warningCount > 0 && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">{warningCount} warnings</Badge>}
          <div className="flex-1" />
          <span className={`text-xs font-medium ${paused ? 'text-muted-foreground' : 'text-emerald-400'}`}>
            {paused ? 'Paused' : 'Live'}
          </span>
          <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={() => setPaused(value => !value)}>
            {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>

        <div className="mt-3 grid gap-2 min-[920px]:grid-cols-4">
          <SummaryCard label="avg duration" value={msText(conversationData?.summary.avgDurationMs)} sub="จาก conversation turns" tone={durationClass(conversationData?.summary.avgDurationMs)} />
          <SummaryCard label="tool path" value={String(toolPathCount)} sub="direct MCP path" tone="text-emerald-300" />
          <SummaryCard label="model path" value={String(modelPathCount)} sub="agent/model path" tone="text-blue-300" />
          <SummaryCard label="warnings" value={String(warningCount)} sub="quality/tool/model" tone={warningCount > 0 ? 'text-amber-300' : 'text-emerald-300'} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="ค้นหา user, agent, intent, tool, คำถาม หรือคำตอบ"
            className="h-9 pl-8"
          />
        </div>
        <select
          aria-label="Channel filter"
          value={channelFilter}
          onChange={event => setChannelFilter(event.target.value as ChannelFilter)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
        >
          <option value="ALL">ทุก channel</option>
          <option value="telegram">Telegram</option>
          <option value="line">LINE</option>
          <option value="webchat">Webchat</option>
        </select>
        <select
          aria-label="Route filter"
          value={routeFilter}
          onChange={event => setRouteFilter(event.target.value as RouteFilter)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
        >
          <option value="ALL">ทุก route</option>
          <option value="tool_path">Tool path</option>
          <option value="model_path">Model path</option>
          <option value="capability_denied">Denied</option>
          <option value="native">Native</option>
        </select>
        <Button
          size="sm"
          variant={diagnosticsOpen ? 'default' : 'outline'}
          onClick={() => setDiagnosticsOpen(value => !value)}
        >
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          {diagnosticsOpen ? 'Hide diagnostics' : 'Diagnostics'}
        </Button>
      </div>

      {diagnosticsOpen && (
        latencyFetching && !latencyData ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-4 text-sm text-zinc-500">กำลังโหลด diagnostics...</div>
        ) : (
          <LatencyDiagnostics data={latencyData} />
        )
      )}

      <section className="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-800 bg-black/20 p-2">
        {isLoading && (
          <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-zinc-500">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            กำลังโหลด conversation feed...
          </div>
        )}
        {!isLoading && filteredTurns.length === 0 && (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500">
            <CheckCircle2 className="h-5 w-5 text-zinc-400" aria-hidden="true" />
            ไม่พบ conversation ตาม filter นี้
          </div>
        )}
        <div className="space-y-2">
          {filteredTurns.map(turn => (
            <ConversationTurnCard
              key={turn.id}
              turn={turn}
              expanded={expandedIds.has(turn.id)}
              onToggle={() => toggleTurn(turn.id)}
              onReplay={() => {
                if (turn.agentId && turn.sessionKey) {
                  setReplayTarget({ agentId: turn.agentId, sessionKey: turn.sessionKey })
                }
              }}
            />
          ))}
        </div>
      </section>

      {replayTarget && (
        <section className="max-h-[42vh] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-zinc-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-100">Session replay</h2>
            <span className="text-xs text-zinc-500">{replayTarget.agentId}</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setReplayTarget(null)}>Close</Button>
          </div>
          {replayLoading && <p className="text-sm text-zinc-500">กำลังโหลด replay...</p>}
          {replayData && (
            <div className="space-y-2">
              {replayData.messages.map((message, index) => (
                <div key={`${message.timestamp}-${index}`} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                    <span className={message.role === 'user' ? 'text-zinc-200' : 'text-blue-200'}>{message.role}</span>
                    <span>{turnTimeLabel(message.timestamp)}</span>
                    {message.latency != null && <span className={durationClass(message.latency * 1000)}>{message.latency.toFixed(1)}s</span>}
                  </div>
                  {message.text && <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">{message.text}</p>}
                  {message.thinking && (
                    <details className="mt-2 rounded border border-zinc-800 bg-black/20 px-2 py-1 text-xs text-zinc-400">
                      <summary className="cursor-pointer text-zinc-300">Raw thinking debug</summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{message.thinking}</pre>
                    </details>
                  )}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.toolCalls.map((tool, toolIndex) => (
                        <div key={`${tool.name}-${toolIndex}`} className="rounded border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-xs text-purple-100">
                          <div className="font-medium">{tool.name}</div>
                          {tool.result && <p className="mt-1 max-h-24 overflow-auto break-words text-purple-200/80">{tool.result}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
