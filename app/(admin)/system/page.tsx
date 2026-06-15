'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, ClipboardCopy, Info, RefreshCw, ShieldAlert, Terminal, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSupportBundle, getSystemHealth, type SystemCheckStatus, type SystemHealth, type SystemHealthCheck } from '@/lib/api'

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

function CheckRow({ check }: { check: SystemHealthCheck }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[150px_120px_minmax(0,1fr)_90px] md:items-center">
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
      </div>
      <p className="font-mono text-xs text-zinc-400 md:text-right">{check.durationMs}ms</p>
    </div>
  )
}

export default function SystemPage() {
  const qc = useQueryClient()
  const { data: health, isLoading, isFetching } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => getSystemHealth(false),
    staleTime: 15_000,
    refetchInterval: false,
  })

  const refresh = useMutation({
    mutationFn: () => getSystemHealth(true),
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

  const counts = countChecks(health)
  const generated = health?.generatedAt ? new Date(health.generatedAt).toLocaleString('th-TH') : '-'
  const applyCommand = `bash ~/openclaw-api/scripts/update-server.sh --apply --mcp-url ${DEFAULT_MCP_URL} --openrouter-key "$OPENROUTER_KEY"`
  const healthCommand = 'bash ~/openclaw-api/scripts/update-server.sh --health-only'

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
                  <td className="px-4 py-3"><StatusBadge status={agent.soulStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={agent.authStatus} /></td>
                </tr>
              ))}
              {!health?.agents?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-400">No agents found</td>
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
          {(health?.checks ?? []).map(check => <CheckRow key={check.id} check={check} />)}
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
    </div>
  )
}
