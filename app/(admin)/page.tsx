'use client'

import { useMemo, useState, type ReactNode } from 'react'
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
  Info,
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
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
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

function InfoHint({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`ข้อมูลเพิ่มเติม: ${title}`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-muted hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-zinc-200"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription className="text-xs leading-relaxed">{description}</PopoverDescription>
        </PopoverHeader>
        {action && (
          <div className="rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            {action}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SectionHeading({
  title,
  description,
  infoTitle,
  infoDescription,
  infoAction,
  children,
}: {
  title: string
  description?: string
  infoTitle: string
  infoDescription: string
  infoAction?: string
  children?: ReactNode
}) {
  return (
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <InfoHint title={infoTitle} description={infoDescription} action={infoAction} />
        </div>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {children}
    </CardHeader>
  )
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  status,
  infoTitle,
  infoDescription,
  infoAction,
}: {
  title: string
  value: string
  detail?: string
  icon: typeof Activity
  status?: string
  infoTitle: string
  infoDescription: string
  infoAction?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <CardTitle className="truncate text-sm font-medium text-zinc-500">{title}</CardTitle>
          <InfoHint title={infoTitle} description={infoDescription} action={infoAction} />
        </div>
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

type RecommendationSeverity = 'critical' | 'warn' | 'info'

interface Recommendation {
  id: string
  severity: RecommendationSeverity
  title: string
  detail: string
  actionLabel: string
  href: string
}

function addRecommendation(items: Recommendation[], next: Recommendation) {
  if (!items.some(item => item.id === next.id)) items.push(next)
}

function buildRecommendations(data: DashboardOverview): Recommendation[] {
  const items: Recommendation[] = []
  const healthWarnings = data.health.warnings.map(warning => `${warning.id} ${warning.label} ${warning.summary}`.toLowerCase())

  if (data.health.criticalFail > 0 || data.health.status === 'fail') {
    addRecommendation(items, {
      id: 'critical-health',
      severity: 'critical',
      title: 'แก้ critical health checks ก่อนใช้งานจริง',
      detail: `พบ ${data.health.criticalFail} critical issue จาก system health. ตรวจ dependency ที่ล้มเหลวและ run remediation จากหน้า System.`,
      actionLabel: 'Open System',
      href: '/system',
    })
  }

  if (data.release.status === 'behind') {
    addRecommendation(items, {
      id: 'runtime-behind',
      severity: 'warn',
      title: 'วางแผนอัปเดต OpenClaw runtime',
      detail: `ติดตั้งอยู่ ${data.release.installedVersion || 'unknown'} แต่ target คือ ${data.release.targetVersion}. อัปเดตหลัง backup และ smoke test เท่านั้น.`,
      actionLabel: 'Check Runtime',
      href: '/system?section=runtime',
    })
  }

  if (healthWarnings.some(text => text.includes('runtime.guardrails'))) {
    addRecommendation(items, {
      id: 'runtime-guardrails',
      severity: 'warn',
      title: 'ทดสอบ Telegram หลังเปลี่ยน runtime',
      detail: 'Runtime ปัจจุบันอาจเป็น official package ที่ไม่มี ERP guardrail marker บางตัว. ให้รัน regression Telegram ก่อน rollout ลูกค้า และใช้ custom runtime เฉพาะเมื่อพบ regression จริง.',
      actionLabel: 'Open Monitor',
      href: '/monitor',
    })
  }

  if (healthWarnings.some(text => text.includes('fallback model'))) {
    addRecommendation(items, {
      id: 'fallback-model',
      severity: 'warn',
      title: 'ตั้ง fallback model ให้ agent',
      detail: 'ถ้า provider หลัก timeout หรือ error Telegram อาจตอบช้า หรือส่ง error ให้ user. ตั้ง fallback อย่างน้อย agent ที่รับลูกค้าจริง.',
      actionLabel: 'Open Models',
      href: '/model?section=fallbacks',
    })
  }

  if (healthWarnings.some(text => text.includes('image model') || text.includes('imageModel') || text.includes('image understanding'))) {
    addRecommendation(items, {
      id: 'image-model',
      severity: 'warn',
      title: 'ทดสอบการอ่านรูปสินค้า',
      detail: 'ถ้าลูกค้าส่งรูปสินค้า ให้เปิดหน้า Model แล้วทดสอบรูปกับ Model หลักก่อน หรือเลือก Model อ่านรูปแยกเฉพาะเมื่อจำเป็น.',
      actionLabel: 'Open Models',
      href: '/model?section=image',
    })
  }

  if (data.agents.some(agent => agent.toolSource !== 'live' || agent.toolCount === 0)) {
    addRecommendation(items, {
      id: 'mcp-not-live',
      severity: 'warn',
      title: 'ตรวจ MCP tools ของ agent',
      detail: 'มี agent ที่ไม่ได้ใช้ live MCP tools หรือไม่มี tool. Agent อาจตอบว่าไม่มีสิทธิ์ หรือหา ERP ไม่ได้.',
      actionLabel: 'Open Agents',
      href: '/agents',
    })
  }

  if (data.agents.some(agent => agent.soulStatus !== 'ok' || agent.authStatus !== 'ok')) {
    addRecommendation(items, {
      id: 'agent-contract',
      severity: 'warn',
      title: 'ตรวจ SOUL และ auth profile',
      detail: 'พบ agent ที่ SOUL หรือ auth profile ยังไม่ ok. ควร apply template ล่าสุดและตรวจ model key ก่อนเปิดให้ user ถามจริง.',
      actionLabel: 'Open Agents',
      href: '/agents',
    })
  }

  if ((data.operations.telegramBotsConfigured || 0) > (data.operations.telegramBotsOnline || 0)) {
    addRecommendation(items, {
      id: 'telegram-offline',
      severity: 'critical',
      title: 'ตรวจ Telegram bot ที่ยังไม่ online',
      detail: `${formatCount(data.operations.telegramBotsOnline)}/${formatCount(data.operations.telegramBotsConfigured)} bot online. ตรวจ token, binding, gateway log และ webhook/polling conflict.`,
      actionLabel: 'Open Telegram',
      href: '/telegram',
    })
  }

  if (data.latency.stuck > 0) {
    addRecommendation(items, {
      id: 'stuck-turns',
      severity: 'warn',
      title: 'ตรวจ turn ที่ค้างอยู่',
      detail: `มี ${formatCount(data.latency.stuck)} stuck turn ใน telemetry window. เปิด Monitor เพื่อดูว่า stuck ที่ model, tool, หรือ delivery.`,
      actionLabel: 'Open Monitor',
      href: '/monitor',
    })
  }

  if ((data.latency.finalP95Ms || 0) > 10000) {
    addRecommendation(items, {
      id: 'slow-final',
      severity: 'warn',
      title: 'ตรวจ response p95 ที่ช้า',
      detail: `final p95 ตอนนี้ ${formatMs(data.latency.finalP95Ms)}. ดู slow turns และแยกว่าเป็น model latency, MCP latency, หรือ queue.`,
      actionLabel: 'Open Monitor',
      href: '/monitor',
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'all-clear',
      severity: 'info',
      title: 'ระบบพร้อมใช้งาน',
      detail: 'ไม่พบ action เร่งด่วนจาก dashboard overview ตอนนี้. ให้ดู Monitor ระหว่างลูกค้าทดสอบจริงและตรวจ cost เป็นระยะ.',
      actionLabel: 'Open Monitor',
      href: '/monitor',
    })
  }

  return items.slice(0, 6)
}

function recommendationTone(severity: RecommendationSeverity) {
  if (severity === 'critical') {
    return {
      box: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
      badge: 'destructive' as const,
      icon: 'text-red-600 dark:text-red-300',
    }
  }
  if (severity === 'warn') {
    return {
      box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
      badge: 'secondary' as const,
      icon: 'text-amber-600 dark:text-amber-300',
    }
  }
  return {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
    badge: 'default' as const,
    icon: 'text-emerald-600 dark:text-emerald-300',
  }
}

function RecommendedActions({ recommendations }: { recommendations: Recommendation[] }) {
  const hasCritical = recommendations.some(item => item.severity === 'critical')
  const hasWarn = recommendations.some(item => item.severity === 'warn')
  const statusLabel = hasCritical ? 'critical action' : hasWarn ? 'needs attention' : 'ready'

  return (
    <Card>
      <SectionHeading
        title="Recommended Next Actions"
        description="คำแนะนำจาก health, release, channel, latency, MCP และ agent contract ล่าสุด."
        infoTitle="Recommended Next Actions"
        infoDescription="ส่วนนี้รวมสัญญาณที่ทำให้ระบบยังไม่สมบูรณ์ แล้วแปลงเป็นงานที่ admin ควรทำต่อ เช่น ตรวจ System, ตั้ง fallback model, แก้ MCP หรือเปิด Monitor ดู turn ที่ช้า."
        infoAction="คำแนะนำไม่แก้ระบบเอง เป็น navigation ไปยังหน้าที่ควรตรวจ เพื่อกัน operator กด action เสี่ยงโดยไม่ตั้งใจ."
      >
        <Badge variant={hasCritical ? 'destructive' : hasWarn ? 'secondary' : 'default'}>{statusLabel}</Badge>
      </SectionHeading>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recommendations.map(item => {
            const tone = recommendationTone(item.severity)
            return (
              <div key={item.id} className={`rounded-md border p-3 ${tone.box}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 gap-2">
                    {item.severity === 'info' ? (
                      <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${tone.icon}`} />
                    ) : (
                      <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${tone.icon}`} />
                    )}
                    <p className="min-w-0 text-sm font-medium">{item.title}</p>
                  </div>
                  <Badge variant={tone.badge} className="shrink-0">{item.severity}</Badge>
                </div>
                <p className="min-h-12 text-xs leading-relaxed opacity-90">{item.detail}</p>
                <a href={item.href} className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md border border-current/20 bg-background/50 px-2 text-xs font-medium hover:bg-background/80">
                  {item.actionLabel}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
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
  const recommendations = useMemo(() => data ? buildRecommendations(data) : [], [data])

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
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">มีอะไรใหม่ใน OpenClaw {data.whatsNew.version}</p>
                      <InfoHint
                        title="มีอะไรใหม่"
                        description="สรุปเฉพาะสิ่งที่มีผลกับงาน operator เช่น runtime recovery, model fallback, Telegram delivery, cost/usage และ memory diagnostics."
                        action="ใช้เป็น checklist หลังอัปเดต ไม่ใช่ release note ทั้งหมดของ upstream."
                      />
                    </div>
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
              infoTitle="Overall Health"
              infoDescription="ภาพรวม system checks ทั้ง API, gateway, MCP, Telegram, SOUL, auth profile และ runtime warning."
              infoAction="ถ้าเป็น warn หรือ fail ให้เปิด System เพื่อดู check ที่ล้มเหลวและ remediation."
            />
            <MetricCard
              title="Gateway"
              value={String(data.operations.gateway || 'unknown')}
              detail={`${formatCount(data.operations.agents)} agents · ${formatCount(data.operations.members)} active members`}
              icon={Server}
              status={data.operations.gateway}
              infoTitle="Gateway"
              infoDescription="สถานะ OpenClaw gateway ที่รับ event จาก channel และส่งต่อให้ agent/runtime."
              infoAction="ถ้า offline ให้ดู Logs/Monitor ก่อน restart gateway."
            />
            <MetricCard
              title="Runtime"
              value={data.release.installedVersion || 'unknown'}
              detail={`${data.release.status} · target ${data.release.targetVersion}`}
              icon={Cpu}
              status={data.release.status}
              infoTitle="Runtime"
              infoDescription="เวอร์ชัน OpenClaw runtime ที่ติดตั้งจริง เทียบกับ target version ที่ dashboard ใช้เป็น baseline."
              infoAction="ถ้า behind ให้วางแผน backup, update และ smoke test ก่อนใช้กับลูกค้าจริง."
            />
            <MetricCard
              title="MCP Tools"
              value={formatCount(data.agents.reduce((sum, agent) => sum + agent.toolCount, 0))}
              detail={`${data.agents.filter(agent => agent.toolSource === 'live').length}/${data.agents.length} agents live`}
              icon={Wrench}
              status={data.agents.every(agent => agent.toolSource === 'live') ? 'ok' : 'warn'}
              infoTitle="MCP Tools"
              infoDescription="จำนวน tool ที่ agent เห็นจาก MCP ตาม access mode จริง ใช้เป็น source of truth ว่า agent ทำอะไรได้."
              infoAction="ถ้าไม่ live หรือ tool เป็น 0 ให้ตรวจ MCP URL, access mode และ SOUL contract."
            />
            <MetricCard
              title="Telegram"
              value={`${formatCount(data.operations.telegramBotsOnline)}/${formatCount(data.operations.telegramBotsConfigured)}`}
              detail={`${formatCount(data.operations.lineAccounts)} LINE OA · ${formatCount(data.operations.webchatRooms)} webchat rooms`}
              icon={Bot}
              status={(data.operations.telegramBotsOnline || 0) >= (data.operations.telegramBotsConfigured || 0) ? 'ok' : 'warn'}
              infoTitle="Telegram And Channels"
              infoDescription="จำนวน Telegram bot ที่พร้อมใช้งาน เทียบกับที่ตั้งค่าไว้ พร้อมจำนวน LINE OA และ webchat rooms."
              infoAction="ถ้า bot online ไม่ครบ ให้ตรวจ token, binding, gateway log และ polling conflict."
            />
            <MetricCard
              title="Today Response"
              value={formatMs(data.latency.finalP95Ms)}
              detail={p95Detail}
              icon={Gauge}
              status={(data.latency.finalP95Ms || 0) > 10000 ? 'warn' : 'ok'}
              infoTitle="Today Response"
              infoDescription="เวลาตอบกลับจาก telemetry window ล่าสุด แสดง p50 และ p95 ของ final reply เพื่อจับเคสช้า."
              infoAction="ถ้า p95 เกิน 10 วินาที ให้เปิด Monitor ดูว่าเป็น model, MCP, queue หรือ delivery."
            />
            <MetricCard
              title="7-Day Cost"
              value={formatMoney(data.cost.totalCost)}
              detail={`${formatCount(data.cost.modelCalls)} model calls · ${formatCount(data.cost.toolOnlyTurns)} tool-only turns`}
              icon={CircleDollarSign}
              status="ok"
              infoTitle="7-Day Cost"
              infoDescription="ค่าใช้จ่าย model จาก log 7 วันล่าสุด นับเฉพาะ model calls ไม่เอา deterministic tool-only turn ไปปน."
              infoAction="ใช้ตรวจว่า prompt/model หรือ conversation flow ทำให้ค่าใช้จ่ายสูงผิดปกติหรือไม่."
            />
            <MetricCard
              title="Default Model"
              value={modelShort(data.operations.defaultModel)}
              detail={data.operations.defaultModel || 'No default model configured'}
              icon={Activity}
              status={data.operations.defaultModel ? 'ok' : 'warn'}
              infoTitle="Default Model"
              infoDescription="model หลักที่ runtime ใช้เมื่อ agent ไม่ override เอง เป็นตัวกำหนดความเร็ว คุณภาพ และค่าใช้จ่าย."
              infoAction="ถ้าลูกค้าต้องการตอบเร็ว ให้เทียบ latency/cost ใน Monitor ก่อนเปลี่ยน model."
            />
          </div>

          <RecommendedActions recommendations={recommendations} />

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <SectionHeading
                title="Operations Today"
                description="Conversation throughput, latency, and route mix from bounded telemetry."
                infoTitle="Operations Today"
                infoDescription="สรุปปริมาณ turn วันนี้ งานที่ยัง active/stuck, ack/final latency และ route ที่ระบบใช้ เช่น tool path, model path หรือ native command."
                infoAction="ใช้ดูว่า user รอเพราะ model, tool, queue หรือ gateway delivery แล้วเปิด Monitor เพื่อดู turn จริง."
              >
                <Badge variant={data.latency.stuck > 0 ? 'destructive' : 'secondary'}>
                  {data.latency.stuck} stuck
                </Badge>
              </SectionHeading>
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
              <SectionHeading
                title="Actions"
                description="Risky actions stay explicit and reversible."
                infoTitle="Actions"
                infoDescription="ปุ่มแก้ปัญหาแบบ manual สำหรับ operator เช่น restart gateway, clean stale sessions และ doctor fix."
                infoAction="ใช้เมื่อรู้สาเหตุแล้วเท่านั้น ถ้ายังไม่แน่ใจให้เปิด Logs หรือ Monitor ก่อน."
              />
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
              <SectionHeading
                title="Recent Conversations"
                description="Latest Telegram turns with route, intent, tools, warnings, and duration."
                infoTitle="Recent Conversations"
                infoDescription="ตัวอย่าง turn ล่าสุดแบบ conversation-first เพื่อให้เห็น user text, route, intent, tool chain, warning และคำตอบสุดท้ายในที่เดียว."
                infoAction="ถ้าต้อง debug รายละเอียด thinking/tool payload ให้เปิด Monitor แบบเต็ม."
              >
                <a href="/monitor" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-200">
                  Open monitor
                  <ExternalLink className="size-3.5" />
                </a>
              </SectionHeading>
              <CardContent className="space-y-3">
                {data.recentTurns.length ? data.recentTurns.map(turn => <RecentTurn key={turn.id} turn={turn} />) : (
                  <p className="text-sm text-zinc-500">No recent conversation markers found.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <SectionHeading
                title="Cost And Tokens"
                description="Model usage only; deterministic tool-only turns are not counted as model calls."
                infoTitle="Cost And Tokens"
                infoDescription="สรุป token และค่าใช้จ่าย model calls เพื่อแยกต้นทุน AI ออกจาก deterministic tool path."
                infoAction="ถ้าค่าใช้จ่ายสูง ให้ดู agent/model ที่ใช้เยอะ แล้วตรวจ prompt, SOUL, และ flow ที่เข้า model บ่อย."
              />
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
              <SectionHeading
                title="Agent And MCP Matrix"
                description="Source of truth from system health and openclaw.json bindings."
                infoTitle="Agent And MCP Matrix"
                infoDescription="ตารางรวม agent, access mode, MCP URL, จำนวน tools, SOUL status, auth status และ channel binding."
                infoAction="ใช้ตรวจว่า agent เห็น tool ตามสิทธิ์จริงหรือไม่ ก่อนให้ user ถามผ่าน Telegram/LINE/Webchat."
              />
              <CardContent>
                <AgentMatrix agents={data.agents} />
              </CardContent>
            </Card>

            <Card>
              <SectionHeading
                title="Health Warnings"
                description="Release/runtime warnings are included with system checks."
                infoTitle="Health Warnings"
                infoDescription="warning สำคัญจาก health endpoint รวมถึง runtime, fallback model, MCP, SOUL, auth และ telemetry."
                infoAction="ถ้า warning กระทบ production ให้ใช้ Recommended Next Actions หรือเปิด System เพื่อดูรายละเอียดเต็ม."
              />
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
