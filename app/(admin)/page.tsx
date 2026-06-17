'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Cpu,
  ExternalLink,
  Gauge,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wrench,
} from 'lucide-react'
import {
  cleanSessions,
  getDashboardOverview,
  getDoctorStatus,
  restartGateway,
  runDoctorFix,
  type DashboardAgentRow,
  type DashboardOverview,
  type DashboardRecentTurn,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

const WHATS_NEW_KEY = 'whats-new-dismissed-v2026.6.8'

function statusTone(status?: string) {
  if (status === 'ok' || status === 'online' || status === 'current') return 'bg-emerald-600 text-white'
  if (status === 'fail' || status === 'offline') return 'bg-red-600 text-white'
  if (status === 'behind' || status === 'warn') return 'bg-amber-500 text-black'
  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
}

function statusVariant(status?: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'fail' || status === 'offline' || status === 'error') return 'destructive'
  if (status === 'ok' || status === 'online' || status === 'current') return 'default'
  return 'secondary'
}

function formatMs(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '-'
  if (value < 1000) return `${Math.round(value)}ms`
  return `${Math.round(value / 100) / 10}s`
}

function formatMoney(value?: number | null) {
  return `$${Number(value || 0).toFixed(5)}`
}

function formatCount(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '-'
  return Intl.NumberFormat('en-US').format(value)
}

function timeLabel(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function modelShort(value?: string | null) {
  if (!value) return '-'
  return value.replace(/^openrouter\//, '')
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  status,
}: {
  title: string
  value: string
  detail?: string
  icon: typeof Activity
  status?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-sm font-medium text-zinc-500">{title}</CardTitle>
        <span className={`inline-flex size-7 items-center justify-center rounded-md ${status ? statusTone(status) : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300'}`}>
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="truncate text-2xl font-semibold tracking-normal">{value}</p>
        {detail && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{detail}</p>}
      </CardContent>
    </Card>
  )
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800 ${className}`} />
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-28" />)}
      </div>
      <SkeletonBlock className="h-64" />
      <SkeletonBlock className="h-72" />
    </div>
  )
}

function HealthWarnings({ data }: { data: DashboardOverview }) {
  const warnings = data.health.warnings.slice(0, 5)
  if (!warnings.length) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="size-4 shrink-0" />
        Health checks are clean enough for normal operation.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {warnings.map(warning => (
        <div key={`${warning.id}-${warning.summary}`} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{warning.label}</p>
            <p className="break-words text-xs opacity-90">{warning.summary}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentMatrix({ agents }: { agents: DashboardAgentRow[] }) {
  if (!agents.length) return <p className="text-sm text-zinc-500">No agents configured.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-2 pr-3 font-medium">Agent</th>
            <th className="py-2 pr-3 font-medium">Mode</th>
            <th className="py-2 pr-3 font-medium">MCP</th>
            <th className="py-2 pr-3 font-medium">SOUL</th>
            <th className="py-2 pr-3 font-medium">Auth</th>
            <th className="py-2 pr-3 font-medium">Channels</th>
            <th className="py-2 font-medium">MCP URL</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {agents.map(agent => (
            <tr key={agent.id} className="align-top">
              <td className="py-3 pr-3 font-medium">{agent.id}</td>
              <td className="py-3 pr-3 text-zinc-600 dark:text-zinc-300">{agent.accessMode}</td>
              <td className="py-3 pr-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={agent.toolSource === 'live' ? 'default' : 'secondary'}>{agent.toolCount} tools</Badge>
                  <span className="text-xs text-zinc-500">{agent.toolSource}</span>
                </div>
              </td>
              <td className="py-3 pr-3"><Badge variant={statusVariant(agent.soulStatus)}>{agent.soulStatus}</Badge></td>
              <td className="py-3 pr-3"><Badge variant={statusVariant(agent.authStatus)}>{agent.authStatus}</Badge></td>
              <td className="py-3 pr-3 text-xs text-zinc-500">
                TG {agent.channels.telegram} · LINE {agent.channels.line} · Web {agent.channels.webchat}
              </td>
              <td className="max-w-[260px] break-all py-3 font-mono text-xs text-zinc-500">{agent.mcpUrl || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecentTurn({ turn }: { turn: DashboardRecentTurn }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>{timeLabel(turn.startedAt)}</span>
        <Badge variant="secondary">{turn.agentId || 'agent'}</Badge>
        <Badge variant="secondary">{turn.route}</Badge>
        <span>{turn.intent}</span>
        <span>{formatMs(turn.durationMs)}</span>
      </div>
      <div className="space-y-1.5">
        <p className="break-words text-sm font-medium">{turn.userText || '-'}</p>
        <p className="line-clamp-3 break-words text-sm text-zinc-600 dark:text-zinc-300">{turn.finalText || '-'}</p>
      </div>
      {turn.toolChain.length > 0 && (
        <p className="mt-2 break-words font-mono text-xs text-zinc-500">{turn.toolChain.join(' -> ')}</p>
      )}
      {turn.warnings.length > 0 && (
        <p className="mt-2 break-words text-xs text-amber-600">{turn.warnings.join(' · ')}</p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const qc = useQueryClient()
  const [restartDialog, setRestartDialog] = useState(false)
  const [cleanDialog, setCleanDialog] = useState(false)
  const [newsExpanded, setNewsExpanded] = useState(false)
  const [newsDismissed, setNewsDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(WHATS_NEW_KEY) === '1'
  })

  const overview = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => getDashboardOverview(false),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const doctor = useQuery({
    queryKey: ['doctor-status'],
    queryFn: getDoctorStatus,
    refetchInterval: 60_000,
  })

  const restart = useMutation({
    mutationFn: restartGateway,
    onSuccess: () => {
      toast.success('Gateway restarting')
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
        qc.invalidateQueries({ queryKey: ['doctor-status'] })
      }, 3000)
    },
    onError: () => toast.error('Failed to restart gateway'),
  })

  const clean = useMutation({
    mutationFn: cleanSessions,
    onSuccess: () => {
      toast.success('Stale sessions cleaned')
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
    onError: () => toast.error('Clean sessions failed'),
  })

  const doctorFix = useMutation({
    mutationFn: runDoctorFix,
    onSuccess: () => {
      toast.success('Doctor fix applied')
      qc.invalidateQueries({ queryKey: ['doctor-status'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['dashboard-overview'] }), 3000)
    },
    onError: () => toast.error('Doctor fix failed'),
  })

  function dismissNews() {
    localStorage.setItem(WHATS_NEW_KEY, '1')
    setNewsDismissed(true)
  }

  async function refreshDashboard() {
    await getDashboardOverview(true)
    qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    toast.success('Dashboard refreshed')
  }

  const data = overview.data
  const p95Detail = useMemo(() => {
    if (!data) return '-'
    return `p50 ${formatMs(data.latency.finalP50Ms)} · p95 ${formatMs(data.latency.finalP95Ms)}`
  }, [data])

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-normal">OpenClaw ERP Chatbot Admin</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Operator dashboard for runtime health, channel readiness, recent turns, latency, and model cost.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/monitor" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
            <TerminalSquare className="size-4" />
            Monitor
          </a>
          <a href="/system" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
            <ShieldCheck className="size-4" />
            System
          </a>
          <Button variant="outline" onClick={refreshDashboard} disabled={overview.isFetching}>
            <RefreshCw className={`size-4 ${overview.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {overview.isLoading && <OverviewSkeleton />}

      {data && (
        <>
          {!newsDismissed && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Sparkles className="size-4 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">มีอะไรใหม่ใน OpenClaw {data.whatsNew.version}</p>
                    <p className="truncate text-xs text-zinc-500">Operator highlights for this Admin deployment</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setNewsExpanded(v => !v)}>
                    {newsExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    {newsExpanded ? 'ย่อ' : 'ดู'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={dismissNews}>ปิด</Button>
                </div>
              </div>
              {newsExpanded && (
                <div className="grid gap-3 border-t px-4 py-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.whatsNew.items.map(item => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{item.title}</p>
                        <Badge variant="secondary" className="shrink-0">{item.status}</Badge>
                      </div>
                      <p className="line-clamp-3 text-xs text-zinc-600 dark:text-zinc-300">{item.summary}</p>
                      <p className="mt-2 line-clamp-3 text-xs text-zinc-500">{item.action}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Overall Health"
              value={data.health.status.toUpperCase()}
              detail={`${data.health.criticalFail} critical · ${data.health.warn} warnings · ${data.health.ok} ok`}
              icon={ShieldCheck}
              status={data.health.status}
            />
            <MetricCard
              title="Gateway"
              value={String(data.operations.gateway || 'unknown')}
              detail={`${formatCount(data.operations.agents)} agents · ${formatCount(data.operations.members)} active members`}
              icon={Server}
              status={data.operations.gateway}
            />
            <MetricCard
              title="Runtime"
              value={data.release.installedVersion || 'unknown'}
              detail={`${data.release.status} · target ${data.release.targetVersion}`}
              icon={Cpu}
              status={data.release.status}
            />
            <MetricCard
              title="MCP Tools"
              value={formatCount(data.agents.reduce((sum, agent) => sum + agent.toolCount, 0))}
              detail={`${data.agents.filter(agent => agent.toolSource === 'live').length}/${data.agents.length} agents live`}
              icon={Wrench}
              status={data.agents.every(agent => agent.toolSource === 'live') ? 'ok' : 'warn'}
            />
            <MetricCard
              title="Telegram"
              value={`${formatCount(data.operations.telegramBotsOnline)}/${formatCount(data.operations.telegramBotsConfigured)}`}
              detail={`${formatCount(data.operations.lineAccounts)} LINE OA · ${formatCount(data.operations.webchatRooms)} webchat rooms`}
              icon={Bot}
              status={(data.operations.telegramBotsOnline || 0) >= (data.operations.telegramBotsConfigured || 0) ? 'ok' : 'warn'}
            />
            <MetricCard
              title="Today Response"
              value={formatMs(data.latency.finalP95Ms)}
              detail={p95Detail}
              icon={Gauge}
              status={(data.latency.finalP95Ms || 0) > 10000 ? 'warn' : 'ok'}
            />
            <MetricCard
              title="7-Day Cost"
              value={formatMoney(data.cost.totalCost)}
              detail={`${formatCount(data.cost.modelCalls)} model calls · ${formatCount(data.cost.toolOnlyTurns)} tool-only turns`}
              icon={CircleDollarSign}
              status="ok"
            />
            <MetricCard
              title="Default Model"
              value={modelShort(data.operations.defaultModel)}
              detail={data.operations.defaultModel || 'No default model configured'}
              icon={Activity}
              status={data.operations.defaultModel ? 'ok' : 'warn'}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Operations Today</CardTitle>
                  <p className="mt-1 text-sm text-zinc-500">Conversation throughput, latency, and route mix from bounded telemetry.</p>
                </div>
                <Badge variant={data.latency.stuck > 0 ? 'destructive' : 'secondary'}>
                  {data.latency.stuck} stuck
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-zinc-500">Turns</p>
                    <p className="text-xl font-semibold">{formatCount(data.latency.turns)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Active</p>
                    <p className="text-xl font-semibold">{formatCount(data.latency.active)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Ack p95</p>
                    <p className="text-xl font-semibold">{formatMs(data.latency.ackP95Ms)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Final p95</p>
                    <p className="text-xl font-semibold">{formatMs(data.latency.finalP95Ms)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(data.latency.routeBreakdown).map(([route, count]) => (
                    <Badge key={route} variant="secondary">{route}: {count}</Badge>
                  ))}
                  {Object.keys(data.latency.routeBreakdown).length === 0 && <span className="text-sm text-zinc-500">No route markers in the current window.</span>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
                <p className="text-sm text-zinc-500">Risky actions stay explicit and reversible.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => setRestartDialog(true)} disabled={restart.isPending}>
                  <RotateCcw className="size-4" />
                  Restart Gateway
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => setCleanDialog(true)} disabled={clean.isPending}>
                  <Wrench className="size-4" />
                  Clean Stale Sessions
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => doctorFix.mutate()}
                  disabled={doctorFix.isPending || doctor.isLoading || doctor.data?.valid}
                >
                  <ShieldCheck className="size-4" />
                  Run Doctor Fix
                </Button>
                <div className="pt-2 text-xs text-zinc-500">
                  Config: {doctor.isLoading ? 'checking' : doctor.data?.valid ? 'valid' : `${doctor.data?.problems?.length || 0} issue(s)`}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Recent Conversations</CardTitle>
                  <p className="mt-1 text-sm text-zinc-500">Latest Telegram turns with route, intent, tools, warnings, and duration.</p>
                </div>
                <a href="/monitor" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-200">
                  Open monitor
                  <ExternalLink className="size-3.5" />
                </a>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentTurns.length ? data.recentTurns.map(turn => <RecentTurn key={turn.id} turn={turn} />) : (
                  <p className="text-sm text-zinc-500">No recent conversation markers found.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost And Tokens</CardTitle>
                <p className="text-sm text-zinc-500">Model usage only; deterministic tool-only turns are not counted as model calls.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-zinc-500">Input / Output tokens</p>
                  <p className="text-lg font-semibold">{formatCount(data.cost.inputTokens)} / {formatCount(data.cost.outputTokens)}</p>
                </div>
                <div className="space-y-2">
                  {data.cost.byAgent.slice(0, 6).map(agent => {
                    const max = Math.max(...data.cost.byAgent.map(item => item.cost), 0.00001)
                    const width = `${Math.max(4, Math.round((agent.cost / max) * 100))}%`
                    return (
                      <div key={agent.agentId} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">{agent.agentId}</span>
                          <span className="font-mono text-xs">{formatMoney(agent.cost)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div className="h-1.5 rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width }} />
                        </div>
                      </div>
                    )
                  })}
                  {data.cost.byAgent.length === 0 && <p className="text-sm text-zinc-500">No model cost in the selected window.</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Agent And MCP Matrix</CardTitle>
                <p className="text-sm text-zinc-500">Source of truth from system health and openclaw.json bindings.</p>
              </CardHeader>
              <CardContent>
                <AgentMatrix agents={data.agents} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Health Warnings</CardTitle>
                <p className="text-sm text-zinc-500">Release/runtime warnings are included with system checks.</p>
              </CardHeader>
              <CardContent>
                <HealthWarnings data={data} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Dialog open={cleanDialog} onOpenChange={setCleanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean Stale Sessions</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This removes stale main sessions that can route replies through the wrong channel. Active conversation records and agent configuration are preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanDialog(false)}>Cancel</Button>
            <Button onClick={() => { setCleanDialog(false); clean.mutate() }}>Clean</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restartDialog} onOpenChange={setRestartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart Gateway</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Gateway restart can pause bot replies for a few seconds. Use Monitor after restart to confirm new telemetry markers are present.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestartDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setRestartDialog(false); restart.mutate() }}>
              Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
