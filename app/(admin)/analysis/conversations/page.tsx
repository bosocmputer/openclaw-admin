'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Archive, CalendarClock, ChevronRight, Download, Filter, RefreshCw, Search, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import {
  backfillConversations,
  exportConversationAnalysis,
  getAgents,
  getConversationAnalysis,
  getConversationAnalysisDetail,
  getConversationIngestStatus,
  type ConversationAnalysisParams,
  type ConversationAnalysisTurn,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const timeZone = 'Asia/Bangkok'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatMs(value?: number | null) {
  if (!value || value <= 0) return '-'
  if (value < 1000) return `${value}ms`
  return `${Math.round(value / 100) / 10}s`
}

function formatMoney(value?: number | null) {
  if (!value) return '$0.0000'
  return `$${value.toFixed(4)}`
}

function shortText(value: string, max = 180) {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function statusVariant(status: string) {
  if (status === 'ok') return 'default'
  if (status === 'error') return 'destructive'
  if (status === 'warn') return 'secondary'
  return 'outline'
}

function daysBetween(from: string, to: string) {
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, (end - start) / (24 * 60 * 60 * 1000))
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function TurnRow({ turn, selected, onSelect }: { turn: ConversationAnalysisTurn; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-zinc-950 text-white hover:bg-zinc-950 dark:bg-white dark:text-zinc-950'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs tabular-nums opacity-70">{formatDateTime(turn.startedAt)}</span>
            <Badge variant={selected ? 'secondary' : statusVariant(turn.status)}>{turn.status}</Badge>
            <Badge variant="outline" className={selected ? 'border-white/30 text-white' : ''}>{turn.route}</Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium">{turn.userText || '(empty user message)'}</p>
          <p className={cn('mt-1 line-clamp-1 text-xs', selected ? 'text-white/70' : 'text-muted-foreground')}>
            {turn.agentId || 'unknown'} · {turn.channel} · {turn.intent}
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 opacity-50" />
      </div>
    </button>
  )
}

export default function ConversationAnalysisPage() {
  const queryClient = useQueryClient()
  const now = useMemo(() => new Date(), [])
  const [from, setFrom] = useState(toLocalInput(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
  const [to, setTo] = useState(toLocalInput(now))
  const [agent, setAgent] = useState('all')
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState('all')
  const [route, setRoute] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const params: ConversationAnalysisParams = {
    from: fromLocalInput(from),
    to: fromLocalInput(to),
    agent: agent === 'all' ? undefined : agent,
    channel: channel === 'all' ? undefined : channel,
    status: status === 'all' ? undefined : status,
    route: route === 'all' ? undefined : route,
    q: keyword.trim() || undefined,
    limit: 100,
    cursor,
  }
  const baseParams = { ...params, cursor: null }
  const exportTooWide = daysBetween(from, to) > 31

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: ingestStatus } = useQuery({ queryKey: ['conversation-ingest-status'], queryFn: getConversationIngestStatus, retry: false })
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['conversation-analysis', params],
    queryFn: () => getConversationAnalysis(params),
    retry: false,
  })
  const selectedTurn = useMemo(() => {
    if (!data?.turns.length) return null
    return data.turns.find(turn => turn.id === selectedId) || data.turns[0]
  }, [data, selectedId])
  const { data: detail } = useQuery({
    queryKey: ['conversation-detail', selectedTurn?.id],
    queryFn: () => getConversationAnalysisDetail(selectedTurn!.id),
    enabled: Boolean(selectedTurn?.id),
    retry: false,
  })

  const backfillMutation = useMutation({
    mutationFn: () => backfillConversations({ days: 7 }),
    onSuccess: result => {
      toast.success(`Backfill เสร็จแล้ว: imported ${result.imported}, discovered ${result.discovered ?? 0}`)
      queryClient.invalidateQueries({ queryKey: ['conversation-analysis'] })
      queryClient.invalidateQueries({ queryKey: ['conversation-ingest-status'] })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Backfill failed'),
  })

  const exportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'jsonl' | 'markdown') => {
      const blob = await exportConversationAnalysis({ ...baseParams, format })
      return { blob, format }
    },
    onSuccess: ({ blob, format }) => {
      downloadBlob(blob, `conversation-history.${format === 'markdown' ? 'md' : format}`)
      toast.success('Export complete')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Export failed'),
  })

  const summary = data?.summary
  const events = detail?.events ?? []
  const hasTrace = events.some(event => event.type === 'trace')

  function resetCursorAndRefetch() {
    setCursor(null)
    setSelectedId(null)
    void queryClient.invalidateQueries({ queryKey: ['conversation-analysis'] })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conversation Analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ดูประวัติการคุยย้อนหลัง วิเคราะห์คำถาม, tool, คำตอบ, latency และ export ให้ทีมปรับปรุง agent
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            โหลดใหม่
          </Button>
          <Button variant="outline" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
            <Archive className="size-4" />
            Backfill 7 วัน
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-4" />
            ตัวกรอง
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 lg:grid-cols-[repeat(6,minmax(0,1fr))]">
          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">เริ่ม</span>
            <Input type="datetime-local" value={from} onChange={e => { setFrom(e.target.value); setCursor(null) }} />
          </label>
          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">สิ้นสุด</span>
            <Input type="datetime-local" value={to} onChange={e => { setTo(e.target.value); setCursor(null) }} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Agent</span>
            <Select value={agent} onValueChange={v => { setAgent(v || 'all'); setCursor(null) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Channel</span>
            <Select value={channel} onValueChange={v => { setChannel(v || 'all'); setCursor(null) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="line">LINE</SelectItem>
                <SelectItem value="webchat">Webchat</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <Select value={status} onValueChange={v => { setStatus(v || 'all'); setCursor(null) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="ok">ok</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Route</span>
            <Select value={route} onValueChange={v => { setRoute(v || 'all'); setCursor(null) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="tool_path">tool_path</SelectItem>
                <SelectItem value="model_path">model_path</SelectItem>
                <SelectItem value="native">native</SelectItem>
                <SelectItem value="capability_denied">capability_denied</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 lg:col-span-3">
            <span className="text-xs font-medium text-muted-foreground">ค้นหา</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
              <Input className="pl-8" value={keyword} onChange={e => { setKeyword(e.target.value); setCursor(null) }} placeholder="ค้นจากคำถาม, คำตอบ, tool หรือ turn id" />
            </div>
          </label>
          <div className="flex items-end gap-2 lg:col-span-3">
            <Button variant="secondary" onClick={resetCursorAndRefetch}>ใช้ตัวกรอง</Button>
            <Button
              variant="outline"
              disabled={exportTooWide || exportMutation.isPending}
              onClick={() => exportMutation.mutate('csv')}
              title={exportTooWide ? 'Export จำกัดสูงสุด 31 วันต่อครั้ง' : undefined}
            >
              <Download className="size-4" />
              CSV
            </Button>
            <Button variant="outline" disabled={exportTooWide || exportMutation.isPending} onClick={() => exportMutation.mutate('jsonl')}>JSONL</Button>
            <Button variant="outline" disabled={exportTooWide || exportMutation.isPending} onClick={() => exportMutation.mutate('markdown')}>Markdown</Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">ยังโหลด conversation history ไม่ได้</p>
              <p className="mt-1">ตรวจ `DATABASE_URL` และ `CONVERSATION_ANALYSIS_ENABLED` แล้วลอง Backfill อีกครั้ง</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Turns" value={String(summary?.count ?? 0)} hint={`${summary?.uniqueUsers ?? 0} users`} />
        <StatCard label="Issues" value={String(summary?.issueCount ?? 0)} hint="warn + error" />
        <StatCard label="p95" value={formatMs(summary?.p95DurationMs)} hint={`avg ${formatMs(summary?.avgDurationMs)}`} />
        <StatCard label="Cost" value={formatMoney(summary?.totalCost)} hint={`${summary?.inputTokens ?? 0}/${summary?.outputTokens ?? 0} tokens`} />
        <StatCard label="Model turns" value={String(summary?.modelTurns ?? 0)} hint="model_path" />
        <StatCard label="Tool-only" value={String(summary?.toolOnlyTurns ?? 0)} hint="deterministic/native" />
      </div>

      <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card xl:grid-cols-[420px_1fr]">
        <section className="border-b xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div>
              <p className="text-sm font-medium">Conversation turns</p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? 'Loading...' : `${data?.turns.length ?? 0} shown`}
              </p>
            </div>
            {ingestStatus ? (
              <Badge variant="outline" className="gap-1">
                <CalendarClock className="size-3" />
                {ingestStatus.turns.count} stored
              </Badge>
            ) : null}
          </div>
          <div className="max-h-[620px] overflow-auto">
            {!isLoading && data?.turns.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">ยังไม่มีข้อมูลย้อนหลังในช่วงนี้</p>
                <p className="mt-1">ลองขยายช่วงวันที่ หรือกด Backfill 7 วันเพื่อนำ log ที่ยังมีอยู่เข้า database</p>
              </div>
            ) : null}
            {data?.turns.map(turn => (
              <TurnRow key={turn.id} turn={turn} selected={turn.id === selectedTurn?.id} onSelect={() => setSelectedId(turn.id)} />
            ))}
            {data?.hasMore ? (
              <div className="p-3">
                <Button className="w-full" variant="outline" onClick={() => setCursor(data.nextCursor)}>
                  โหลดหน้าถัดไป
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="min-w-0">
          {!selectedTurn ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              เลือก conversation เพื่อดู transcript
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(selectedTurn.status)}>{selectedTurn.status}</Badge>
                    <Badge variant="outline">{selectedTurn.agentId || 'unknown'}</Badge>
                    <Badge variant="outline">{selectedTurn.channel}</Badge>
                    <span className="text-sm text-muted-foreground">{formatDateTime(selectedTurn.startedAt)}</span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">Turn detail</h2>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{selectedTurn.id}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-right text-xs">
                  <div><p className="text-muted-foreground">Latency</p><p className="font-medium">{formatMs(selectedTurn.durationMs)}</p></div>
                  <div><p className="text-muted-foreground">Cost</p><p className="font-medium">{formatMoney(selectedTurn.cost)}</p></div>
                  <div><p className="text-muted-foreground">Tools</p><p className="font-medium">{selectedTurn.toolCount}</p></div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">คำถาม</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{selectedTurn.userText || '(empty)'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">คำตอบ</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{selectedTurn.finalText || '(no final reply)'}</p>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Timeline</p>
                    <p className="text-xs text-muted-foreground">
                      Trace แสดงเฉพาะข้อมูลที่ runtime บันทึกไว้จริง
                    </p>
                  </div>
                  <Badge variant="outline">{events.length} events</Badge>
                </div>
                <div className="divide-y">
                  {!hasTrace ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      ไม่มี trace ที่ runtime บันทึกไว้สำหรับ turn นี้
                    </div>
                  ) : null}
                  {events.map((event, index) => (
                    <details key={`${event.type}-${index}`} className="group px-3 py-3" open={event.type !== 'trace'}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          {event.type === 'tool' ? <Wrench className="size-4 shrink-0 text-muted-foreground" /> : null}
                          <Badge variant={event.type === 'warning' ? 'destructive' : 'secondary'}>{event.type}</Badge>
                          <span className="truncate text-sm font-medium">{event.title}</span>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
                      </summary>
                      <div className="mt-3 space-y-2">
                        {event.body ? (
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-relaxed">{event.body}</pre>
                        ) : (
                          <p className="text-xs text-muted-foreground">ไม่มีรายละเอียดข้อความ</p>
                        )}
                        {event.payload && Object.keys(event.payload).length > 0 ? (
                          <pre className="max-h-80 overflow-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
