'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Info,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  cleanSessions,
  getAgentSoul,
  getAgentSoulTemplate,
  getModelReadiness,
  getSupportBundle,
  getSystemHealth,
  markTelegramRegressionPassed,
  putAgentSoul,
  resetAgentSessions,
  restartGateway,
  runDoctorFix,
  testModelRuntime,
  type ModelReadinessIssue,
  type ModelRuntimeTestResult,
  type SystemCheckStatus,
  type SystemHealth,
  type SystemHealthCheck,
} from '@/lib/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const DEFAULT_MCP_URL = 'http://192.168.2.248:3515/sse'

function statusClass(status: SystemCheckStatus) {
  switch (status) {
    case 'ok': return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
    case 'warn': return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
    case 'fail': return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
    default: return 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
  }
}

function StatusIcon({ status }: { status: SystemCheckStatus }) {
  if (status === 'ok') return <CheckCircle2 className="size-4" />
  if (status === 'warn') return <AlertTriangle className="size-4" />
  if (status === 'fail') return <XCircle className="size-4" />
  return <Info className="size-4" />
}

function StatusBadge({ status }: { status: SystemCheckStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}>
      <StatusIcon status={status} />
      <span className="uppercase">{status}</span>
    </span>
  )
}

function countChecks(health?: SystemHealth) {
  const checks = health?.checks ?? []
  return {
    ok: checks.filter(c => c.status === 'ok').length,
    warn: checks.filter(c => c.status === 'warn').length,
    fail: checks.filter(c => c.status === 'fail').length,
    info: checks.filter(c => c.status === 'info').length,
    criticalFail: checks.filter(c => c.severity === 'critical' && c.status === 'fail').length,
  }
}

function copyText(label: string, text: string) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error(`Failed to copy ${label}`))
}

type ActionStatus = 'ok' | 'warn' | 'fail' | 'running' | 'cancelled'

interface ActionResult {
  id: string
  label: string
  status: ActionStatus
  summary: string
  detail?: string
  durationMs?: number
  at: string
}

interface RuntimeProgress {
  running: boolean
  currentModel: string | null
  completed: number
  total: number
  results: ActionResult[]
  cancelled?: boolean
}

type ConfirmKind = 'restart-gateway' | 'clean-sessions' | 'telegram-regression' | 'apply-soul' | 'doctor-fix'

interface ConfirmRequest {
  kind: ConfirmKind
  title: string
  description: string
  confirmLabel: string
  agentId?: string
  destructive?: boolean
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function formatDuration(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`
}

function detectPersona(soul: string) {
  if (soul.includes('ตอบเป็นกันเอง')) return 'friendly'
  if (soul.includes('ตอบสดใส')) return 'cheerful'
  if (soul.includes('ตอบข้อมูลล้วน')) return 'strict'
  return 'professional'
}

function uniqueRuntimeIssues(issues: ModelReadinessIssue[] = []) {
  const seen = new Set<string>()
  return issues.filter(issue => {
    if (!issue.ref) return false
    const key = `${issue.ref}:${issue.capability || 'text'}`
    if (seen.has(key)) return false
    seen.add(key)
    return issue.status !== 'runtime_verified'
  })
}

function checkAgentId(check: SystemHealthCheck) {
  const match = check.id.match(/^(soul|mcp|auth|model\.fallback|model\.image)\.(.+)$/)
  return match?.[2] || null
}

function isActionableCheck(check: SystemHealthCheck) {
  if (check.status === 'warn' || check.status === 'fail') return true
  return ['runtime.guardrails', 'telemetry.telegram'].includes(check.id)
}

function actionSummary(check: SystemHealthCheck) {
  if (check.id === 'model.readiness') {
    return {
      cause: 'Model ที่ตั้งไว้ยังไม่ได้ถูกทดสอบผ่าน OpenClaw runtime จริง หรือมีผลทดสอบที่ยังไม่พร้อม',
      impact: 'ถ้า provider/runtime เรียก model ไม่ได้ Telegram อาจ timeout หรือส่ง error ให้ user',
    }
  }
  if (check.id === 'runtime.guardrails') {
    return {
      cause: 'runtime marker บางตัวไม่ครบ หรือเป็น custom/official runtime ที่ต้องยืนยันด้วย regression test',
      impact: 'ถ้าเพิ่งเปลี่ยน runtime ควรทดสอบ Telegram flow จริงก่อน rollout ต่อ',
    }
  }
  if (check.id === 'telemetry.telegram') {
    return {
      cause: 'ยังไม่มี Telegram latency marker ใน log window ล่าสุด',
      impact: 'Dashboard อาจยังไม่สะท้อน latency ของข้อความ Telegram ล่าสุด',
    }
  }
  if (check.id === 'gateway.process') {
    return {
      cause: 'Gateway process ไม่อยู่ในสถานะที่ health คาดหวัง',
      impact: 'ช่องทาง chat อาจรับหรือส่งข้อความไม่ได้จนกว่า gateway จะกลับมา',
    }
  }
  if (check.id.startsWith('soul.')) {
    return {
      cause: 'SOUL contract หรือ template guardrail ของ agent ไม่ตรงกับ tools/config ล่าสุด',
      impact: 'agent อาจตอบนอกขอบเขต เรียก tool ผิด หรือยังไม่ได้ใช้ rule ล่าสุด',
    }
  }
  if (check.id.startsWith('mcp.')) {
    return {
      cause: 'MCP tools ของ agent ไม่พร้อม หรือจำนวน tools ไม่ตรงกับที่คาด',
      impact: 'agent อาจค้นข้อมูล ERP ไม่ได้ หรือความสามารถบางอย่างหายไป',
    }
  }
  if (check.id.startsWith('auth.')) {
    return {
      cause: 'provider key หรือ auth profile ของ agent ยังไม่พร้อม',
      impact: 'model call อาจล้มเหลว หรือ fallback ไม่ทำงานเมื่อต้องตอบ user',
    }
  }
  if (check.id === 'telegram.api') {
    return {
      cause: 'Telegram bot account บางตัวติดต่อ Telegram API ไม่ได้',
      impact: 'ผู้ใช้บาง channel อาจไม่ได้รับคำตอบจาก bot',
    }
  }
  return {
    cause: check.summary,
    impact: check.remediation || 'ตรวจรายละเอียด แล้วใช้ action ที่เกี่ยวข้องหรือ copy support bundle ส่งให้ทีมเทคนิค',
  }
}

function ResultBadge({ status }: { status: ActionStatus }) {
  const classes = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-700',
    fail: 'border-red-200 bg-red-50 text-red-700',
    running: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    cancelled: 'border-zinc-200 bg-zinc-50 text-zinc-500',
  }[status]
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${classes}`}>{status}</span>
}

function CheckWarnings({ check }: { check: SystemHealthCheck }) {
  if (!check.warnings?.length) return null
  return (
    <div className="mt-2 space-y-1 rounded-md border bg-zinc-50 p-2 dark:bg-zinc-900">
      {check.warnings.slice(0, 5).map((warning, index) => (
        <div key={`${warning.id || warning.ref || index}`} className="min-w-0 text-xs text-zinc-600 dark:text-zinc-300">
          <span className="font-medium">{warning.status || warning.id || 'warning'}:</span>{' '}
          <span className="break-words">{warning.summary || warning.ref || '-'}</span>
        </div>
      ))}
      {check.warnings.length > 5 && (
        <p className="text-xs text-zinc-400">+{check.warnings.length - 5} more issue(s)</p>
      )}
    </div>
  )
}

function CheckRow({ check, actions }: { check: SystemHealthCheck; actions?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b px-4 py-3 last:border-b-0 lg:grid-cols-[150px_120px_minmax(0,1fr)_minmax(120px,auto)_90px] lg:items-center">
      <div className="flex items-center gap-2 min-w-0">
        <StatusBadge status={check.status} />
      </div>
      <Badge variant={check.severity === 'critical' ? 'destructive' : 'secondary'} className="w-fit">
        {check.severity}
      </Badge>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{check.label}</p>
        <p className="mt-0.5 break-words text-xs text-zinc-500">{check.summary}</p>
        {check.remediation && (
          <p className="mt-1 break-words text-xs text-amber-700 dark:text-amber-300">{check.remediation}</p>
        )}
        <CheckWarnings check={check} />
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div>
      <p className="font-mono text-xs text-zinc-400 lg:text-right">{check.durationMs}ms</p>
    </div>
  )
}

function ActionableHealthPanel({
  checks,
  runtimeProgress,
  actionResults,
  activeAction,
  onCancelRuntimeTests,
  renderActions,
}: {
  checks: SystemHealthCheck[]
  runtimeProgress: RuntimeProgress | null
  actionResults: ActionResult[]
  activeAction: string | null
  onCancelRuntimeTests: () => void
  renderActions: (check: SystemHealthCheck) => ReactNode
}) {
  const actionable = checks.filter(isActionableCheck)
  const blocking = actionable.filter(check => check.status === 'warn' || check.status === 'fail')
  const informational = actionable.filter(check => check.status === 'info')

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Actionable Health</CardTitle>
            <p className="mt-1 text-sm text-zinc-500">
              Clear common warnings from the UI. Risky actions require confirmation and nothing runs automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={blocking.length ? 'destructive' : 'secondary'}>{blocking.length} need action</Badge>
            <Badge variant="outline">{informational.length} info</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actionable.length === 0 ? (
          <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            All checks are clear. Use Run Health Check after changing config, models, gateway, or channel settings.
          </div>
        ) : (
          actionable.map(check => {
            const summary = actionSummary(check)
            return (
              <div key={check.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={check.status} />
                      <span className="font-mono text-xs text-zinc-400">{check.id}</span>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{check.label}</p>
                    </div>
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-500">สาเหตุ</p>
                        <p className="break-words text-zinc-700 dark:text-zinc-200">{summary.cause}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-500">ผลกระทบ</p>
                        <p className="break-words text-zinc-700 dark:text-zinc-200">{summary.impact}</p>
                      </div>
                    </div>
                    <p className="break-words text-xs text-zinc-500">{check.summary}</p>
                    <CheckWarnings check={check} />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[360px] xl:justify-end">
                    {renderActions(check)}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {runtimeProgress && (
          <div className="rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {runtimeProgress.running ? 'กำลังทดสอบ model ที่ตั้งไว้' : runtimeProgress.cancelled ? 'ยกเลิกการทดสอบ model แล้ว' : 'ทดสอบ model เสร็จแล้ว'}
                </p>
                <p className="mt-1 break-all text-xs text-zinc-500">
                  {runtimeProgress.currentModel || `${runtimeProgress.completed}/${runtimeProgress.total} completed`}
                </p>
              </div>
              {runtimeProgress.running && (
                <Button type="button" variant="outline" size="sm" onClick={onCancelRuntimeTests}>
                  Cancel
                </Button>
              )}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all dark:bg-zinc-100"
                style={{ width: `${runtimeProgress.total ? Math.round((runtimeProgress.completed / runtimeProgress.total) * 100) : 0}%` }}
              />
            </div>
            <div className="mt-3 space-y-2">
              {runtimeProgress.results.map(result => (
                <div key={result.id} className="flex flex-col gap-1 rounded-md border bg-background p-2 text-xs sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ResultBadge status={result.status} />
                      <span className="break-all font-mono">{result.label}</span>
                    </div>
                    <p className="mt-1 break-words text-zinc-600 dark:text-zinc-300">{result.summary}</p>
                  </div>
                  <span className="shrink-0 text-zinc-400">{formatDuration(result.durationMs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {actionResults.length > 0 && (
          <div className="rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Latest action result</p>
                <p className="text-xs text-zinc-500">{formatTimestamp(actionResults[0].at)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyText('action result', JSON.stringify(actionResults[0], null, 2))}
              >
                <ClipboardCopy />
                Copy action result
              </Button>
            </div>
            <div className="mt-3 rounded-md border bg-zinc-50 p-2 text-sm dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-2">
                <ResultBadge status={actionResults[0].status} />
                <span className="font-medium">{actionResults[0].label}</span>
                <span className="text-xs text-zinc-400">{formatDuration(actionResults[0].durationMs)}</span>
              </div>
              <p className="mt-1 break-words text-zinc-600 dark:text-zinc-300">{actionResults[0].summary}</p>
              {actionResults[0].detail && <p className="mt-1 break-words text-xs text-zinc-500">{actionResults[0].detail}</p>}
            </div>
          </div>
        )}

        {activeAction && (
          <div className="flex items-center gap-2 rounded-lg border bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300" aria-live="polite">
            <Loader2 className="size-4 animate-spin" />
            Running {activeAction}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SystemPage() {
  const qc = useQueryClient()
  const runtimeAbortRef = useRef<AbortController | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [actionResults, setActionResults] = useState<ActionResult[]>([])
  const [runtimeProgress, setRuntimeProgress] = useState<RuntimeProgress | null>(null)
  const { data: health, isLoading, isFetching } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => getSystemHealth(false),
    staleTime: 15_000,
    refetchInterval: false,
  })

  async function refreshHealthNow() {
    const data = await getSystemHealth(true)
    qc.setQueryData(['system-health'], data)
    return data
  }

  const refresh = useMutation({
    mutationFn: refreshHealthNow,
    onSuccess: data => {
      qc.setQueryData(['system-health'], data)
      toast.success('Health check refreshed')
    },
    onError: () => toast.error('Health check failed'),
  })

  const support = useMutation({
    mutationFn: getSupportBundle,
    onSuccess: bundle => copyText('Support bundle', JSON.stringify(bundle, null, 2)),
    onError: () => toast.error('Failed to build support bundle'),
  })

  const addActionResult = (result: Omit<ActionResult, 'at'>) => {
    setActionResults(prev => [{ ...result, at: new Date().toISOString() }, ...prev].slice(0, 8))
  }

  async function runConfiguredModelRuntimeTests() {
    if (activeAction) return
    setActiveAction('model runtime test')
    const startedAt = performance.now()
    const controller = new AbortController()
    runtimeAbortRef.current = controller

    try {
      const readiness = await getModelReadiness(true)
      const issues = uniqueRuntimeIssues(readiness.runtimeVerificationIssues || [])

      if (!issues.length) {
        setRuntimeProgress({ running: false, currentModel: null, completed: 0, total: 0, results: [] })
        addActionResult({
          id: 'model-runtime-test',
          label: 'ทดสอบ Model ที่ตั้งไว้',
          status: 'ok',
          summary: 'ไม่พบ model ที่ต้อง runtime test เพิ่ม',
          durationMs: performance.now() - startedAt,
        })
        await refreshHealthNow()
        toast.success('Model readiness is already verified')
        return
      }

      setRuntimeProgress({ running: true, currentModel: issues[0].ref, completed: 0, total: issues.length, results: [] })
      const results: ActionResult[] = []

      for (const issue of issues) {
        if (controller.signal.aborted) break
        setRuntimeProgress(prev => prev ? { ...prev, currentModel: issue.ref } : prev)
        const testStarted = performance.now()
        try {
          const result: ModelRuntimeTestResult = await testModelRuntime({
            model: issue.ref,
            capability: issue.capability === 'image' ? 'image' : 'text',
            mode: 'gateway',
            refresh: true,
          }, controller.signal)
          const actionResult: ActionResult = {
            id: `runtime-test:${issue.ref}:${issue.capability || 'text'}`,
            label: issue.ref,
            status: result.ok ? 'ok' : 'fail',
            summary: result.safeMessage || result.summary || result.status,
            detail: result.outputPreview || result.failureReason || undefined,
            durationMs: result.durationMs ?? performance.now() - testStarted,
            at: new Date().toISOString(),
          }
          results.push(actionResult)
        } catch (error) {
          const aborted = controller.signal.aborted
          results.push({
            id: `runtime-test:${issue.ref}:${issue.capability || 'text'}`,
            label: issue.ref,
            status: aborted ? 'cancelled' : 'fail',
            summary: aborted ? 'ยกเลิกการทดสอบ model แล้ว' : 'Runtime test ไม่สำเร็จ',
            detail: error instanceof Error ? error.message : String(error),
            durationMs: performance.now() - testStarted,
            at: new Date().toISOString(),
          })
          if (aborted) break
        }
        setRuntimeProgress({
          running: true,
          currentModel: null,
          completed: results.length,
          total: issues.length,
          results: [...results],
        })
      }

      const cancelled = controller.signal.aborted
      setRuntimeProgress({
        running: false,
        currentModel: null,
        completed: results.length,
        total: issues.length,
        results,
        cancelled,
      })
      const failed = results.filter(result => result.status === 'fail').length
      addActionResult({
        id: 'model-runtime-test',
        label: 'ทดสอบ Model ที่ตั้งไว้',
        status: cancelled ? 'cancelled' : failed ? 'warn' : 'ok',
        summary: cancelled
          ? `ยกเลิกหลังทดสอบ ${results.length}/${issues.length} model`
          : failed
            ? `ทดสอบเสร็จ แต่มี ${failed} model ที่ไม่ผ่าน`
            : `ทดสอบผ่านครบ ${results.length} model`,
        detail: results.map(result => `${result.label}: ${result.status}`).join(', '),
        durationMs: performance.now() - startedAt,
      })
      await refreshHealthNow()
      if (cancelled) toast.info('Model runtime test cancelled')
      else if (failed) toast.warning('Some model runtime tests failed')
      else toast.success('All selected models passed runtime test')
    } catch (error) {
      setRuntimeProgress(prev => prev ? { ...prev, running: false } : null)
      addActionResult({
        id: 'model-runtime-test',
        label: 'ทดสอบ Model ที่ตั้งไว้',
        status: 'fail',
        summary: 'เริ่ม runtime test ไม่สำเร็จ',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startedAt,
      })
      toast.error('Model runtime test failed')
    } finally {
      runtimeAbortRef.current = null
      setActiveAction(null)
    }
  }

  function cancelRuntimeTests() {
    runtimeAbortRef.current?.abort()
    setRuntimeProgress(prev => prev ? { ...prev, cancelled: true } : prev)
  }

  async function runConfirmedAction() {
    if (!confirmRequest || activeAction) return
    const request = confirmRequest
    const startedAt = performance.now()
    setConfirmRequest(null)
    setActiveAction(request.confirmLabel)

    try {
      if (request.kind === 'restart-gateway') {
        await restartGateway()
        addActionResult({
          id: 'restart-gateway',
          label: 'Restart Gateway',
          status: 'ok',
          summary: 'Gateway restart สำเร็จ',
          durationMs: performance.now() - startedAt,
        })
      } else if (request.kind === 'clean-sessions') {
        await cleanSessions()
        addActionResult({
          id: 'clean-sessions',
          label: 'Clean Stale Sessions',
          status: 'ok',
          summary: 'ล้าง stale sessions สำเร็จ',
          durationMs: performance.now() - startedAt,
        })
      } else if (request.kind === 'telegram-regression') {
        await markTelegramRegressionPassed('system-confirmed')
        addActionResult({
          id: 'telegram-regression',
          label: 'ยืนยัน Regression Telegram',
          status: 'ok',
          summary: 'บันทึกว่า Telegram regression test ผ่านแล้ว',
          durationMs: performance.now() - startedAt,
        })
      } else if (request.kind === 'doctor-fix') {
        await runDoctorFix()
        addActionResult({
          id: 'doctor-fix',
          label: 'Run Doctor Fix',
          status: 'ok',
          summary: 'openclaw doctor --fix สำเร็จ',
          durationMs: performance.now() - startedAt,
        })
      } else if (request.kind === 'apply-soul' && request.agentId) {
        const currentSoul = await getAgentSoul(request.agentId)
        const persona = detectPersona(currentSoul)
        const template = await getAgentSoulTemplate(request.agentId, persona, true)
        await putAgentSoul(request.agentId, template.soul)
        const reset = await resetAgentSessions(request.agentId)
        await restartGateway()
        addActionResult({
          id: `apply-soul:${request.agentId}`,
          label: `Apply SOUL Template ${request.agentId}`,
          status: 'ok',
          summary: `Apply template สำเร็จ, reset ${reset.removed} active session(s), restart gateway แล้ว`,
          durationMs: performance.now() - startedAt,
        })
      }
      await refreshHealthNow()
      toast.success(`${request.confirmLabel} complete`)
    } catch (error) {
      addActionResult({
        id: request.kind,
        label: request.confirmLabel,
        status: 'fail',
        summary: `${request.confirmLabel} ไม่สำเร็จ`,
        detail: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startedAt,
      })
      toast.error(`${request.confirmLabel} failed`)
    } finally {
      setActiveAction(null)
    }
  }

  const counts = countChecks(health)
  const checks = useMemo(() => health?.checks ?? [], [health])
  const generated = health?.generatedAt ? new Date(health.generatedAt).toLocaleString('th-TH') : '-'
  const applyCommand = `bash ~/openclaw-api/scripts/update-server.sh --apply --mcp-url ${DEFAULT_MCP_URL} --openrouter-key "$OPENROUTER_KEY"`
  const healthCommand = 'bash ~/openclaw-api/scripts/update-server.sh --health-only'

  function renderCheckActions(check: SystemHealthCheck) {
    const disabled = Boolean(activeAction)
    const agentId = checkAgentId(check)
    const actions: ReactNode[] = []
    const pushLink = (href: string, label: string) => {
      actions.push(
        <Link key={`${check.id}:${href}:${label}`} href={href} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}>
          <ExternalLink className="size-3.5" />
          {label}
        </Link>
      )
    }

    if (check.id === 'model.readiness') {
      actions.push(
        <Button key="test-models" type="button" size="sm" onClick={runConfiguredModelRuntimeTests} disabled={disabled || runtimeProgress?.running}>
          <PlayCircle />
          ทดสอบ Model ที่ตั้งไว้
        </Button>
      )
      pushLink('/model', 'Open Model & Keys')
    } else if (check.id === 'runtime.guardrails') {
      actions.push(
        <Button
          key="confirm-regression"
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmRequest({
            kind: 'telegram-regression',
            title: 'ยืนยัน Regression Telegram ผ่านแล้ว?',
            description: 'ใช้เมื่อคุณทดสอบ /reset, ทักทาย, ค้นสินค้า และเลือกเลขรายการใน Telegram จริงแล้วเท่านั้น',
            confirmLabel: 'ยืนยันว่าทดสอบผ่าน',
          })}
          disabled={disabled}
        >
          <ShieldCheck />
          ยืนยันผ่านแล้ว
        </Button>
      )
      pushLink('/monitor', 'Open Monitor')
    } else if (check.id === 'telemetry.telegram') {
      pushLink('/monitor', 'Open Monitor')
      actions.push(
        <Button key="refresh" type="button" size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={disabled || refresh.isPending || isFetching}>
          <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} />
          Refresh Health
        </Button>
      )
    } else if (check.id === 'gateway.process' || check.summary.toLowerCase().includes('gateway')) {
      actions.push(
        <Button
          key="restart"
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmRequest({
            kind: 'restart-gateway',
            title: 'Restart Gateway?',
            description: 'Gateway จะ reconnect channels และ active user อาจรอสักครู่ ใช้เมื่อ health หรือ config ต้อง reload',
            confirmLabel: 'Restart Gateway',
            destructive: true,
          })}
          disabled={disabled}
        >
          <RotateCcw />
          Restart Gateway
        </Button>
      )
    }

    if (check.id.startsWith('soul.') && agentId) {
      pushLink(`/agents/${encodeURIComponent(agentId)}`, 'Open Agent')
      actions.push(
        <Button
          key="apply-soul"
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmRequest({
            kind: 'apply-soul',
            agentId,
            title: `Apply SOUL Template ให้ ${agentId}?`,
            description: 'ระบบจะโหลด template ล่าสุด ทับ SOUL ปัจจุบัน, reset active sessions และ restart gateway ควรใช้เมื่อคุณต้องการรับ guardrail ล่าสุด',
            confirmLabel: 'Apply Template',
            destructive: true,
          })}
          disabled={disabled}
        >
          <ShieldCheck />
          Apply Template
        </Button>
      )
    } else if ((check.id.startsWith('mcp.') || check.id.startsWith('model.fallback.') || check.id.startsWith('model.image.')) && agentId) {
      pushLink(`/agents/${encodeURIComponent(agentId)}`, 'Open Agent')
    }

    if (check.id.startsWith('auth.')) pushLink('/model', 'Open Model & Keys')
    if (check.id === 'telegram.api') {
      pushLink('/telegram', 'Open Telegram')
      actions.push(
        <Button
          key="restart-telegram"
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmRequest({
            kind: 'restart-gateway',
            title: 'Restart Gateway?',
            description: 'ใช้หลังแก้ Telegram token, binding หรือ channel config เพื่อให้ gateway โหลดค่าใหม่',
            confirmLabel: 'Restart Gateway',
            destructive: true,
          })}
          disabled={disabled}
        >
          <RotateCcw />
          Restart Gateway
        </Button>
      )
    }

    if (check.id === 'config.openclaw' && check.status !== 'ok') {
      actions.push(
        <Button
          key="doctor-fix"
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmRequest({
            kind: 'doctor-fix',
            title: 'Run OpenClaw Doctor Fix?',
            description: 'ระบบจะรัน openclaw doctor --fix เพื่อซ่อม config ที่ runtime รองรับ ควร copy support bundle ก่อนถ้าไม่แน่ใจ',
            confirmLabel: 'Run Doctor Fix',
            destructive: true,
          })}
          disabled={disabled}
        >
          <Wrench />
          Run Doctor Fix
        </Button>
      )
    }

    if (!actions.length && check.status !== 'ok') {
      actions.push(
        <Button key="copy-support" type="button" size="sm" variant="outline" onClick={() => support.mutate()} disabled={support.isPending}>
          <ClipboardCopy />
          Copy Support
        </Button>
      )
    }

    return actions
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">System Health</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Production checks for API, config, gateway, MCP, Telegram, SOUL hygiene, and agent auth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending || isFetching}>
            <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} />
            Run Health Check
          </Button>
          <Button variant="outline" onClick={() => support.mutate()} disabled={support.isPending}>
            <ClipboardCopy />
            Copy Support Bundle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4" /> Overall
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health ? <StatusBadge status={health.status} /> : <p className="text-sm text-zinc-400">{isLoading ? 'Loading...' : 'Unavailable'}</p>}
            <p className="mt-2 text-xs text-zinc-500">Generated {generated}</p>
            {health?.cache && <p className="text-xs text-zinc-400">cache {health.cache.hit ? 'hit' : 'miss'} · ttl {health.cache.ttlSeconds}s</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="size-4" /> Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={counts.criticalFail ? 'text-2xl font-semibold text-red-600' : 'text-2xl font-semibold text-emerald-600'}>
              {counts.criticalFail}
            </p>
            <p className="text-xs text-zinc-500">critical failures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4" /> Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-amber-600">{counts.warn}</p>
            <p className="text-xs text-zinc-500">non-blocking warnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" /> Passing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-600">{counts.ok}</p>
            <p className="text-xs text-zinc-500">checks ok</p>
          </CardContent>
        </Card>
      </div>

      <ActionableHealthPanel
        checks={checks}
        runtimeProgress={runtimeProgress}
        actionResults={actionResults}
        activeAction={activeAction}
        onCancelRuntimeTests={cancelRuntimeTests}
        renderActions={renderCheckActions}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Agent Matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Agent</th>
                <th className="px-4 py-2 text-left font-medium">Access Mode</th>
                <th className="px-4 py-2 text-left font-medium">MCP URL</th>
                <th className="px-4 py-2 text-left font-medium">Tools</th>
                <th className="px-4 py-2 text-left font-medium">Source</th>
                <th className="px-4 py-2 text-left font-medium">SOUL</th>
                <th className="px-4 py-2 text-left font-medium">Auth</th>
              </tr>
            </thead>
            <tbody>
              {(health?.agents ?? []).map(agent => (
                <tr key={agent.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{agent.id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{agent.accessMode}</td>
                  <td className="max-w-[360px] break-all px-4 py-3 font-mono text-xs text-zinc-500">{agent.mcpUrl}</td>
                  <td className="px-4 py-3">{agent.toolCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={agent.toolSource === 'live' ? 'default' : 'outline'}>{agent.toolSource ?? '-'}</Badge>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={agent.soulStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={agent.authStatus} /></td>
                </tr>
              ))}
              {!health?.agents?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-400">No agents found</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Checks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {checks.map(check => <CheckRow key={check.id} check={check} actions={renderCheckActions(check)} />)}
          {!health?.checks?.length && (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">No health checks available</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="size-4" /> Operator Commands
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 rounded-md border bg-zinc-50 p-3 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between">
            <code className="break-all text-xs">{healthCommand}</code>
            <Button variant="outline" size="sm" onClick={() => copyText('health command', healthCommand)}>
              <ClipboardCopy /> Copy
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-md border bg-zinc-50 p-3 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between">
            <code className="break-all text-xs">{applyCommand}</code>
            <Button variant="outline" size="sm" onClick={() => copyText('update command', applyCommand)}>
              <ClipboardCopy /> Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(confirmRequest)} onOpenChange={open => !open && setConfirmRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmRequest?.title}</DialogTitle>
            <DialogDescription>{confirmRequest?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRequest(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmRequest?.destructive ? 'destructive' : 'default'}
              onClick={runConfirmedAction}
              disabled={!confirmRequest || Boolean(activeAction)}
            >
              {activeAction ? <Loader2 className="animate-spin" /> : null}
              {confirmRequest?.confirmLabel || 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
