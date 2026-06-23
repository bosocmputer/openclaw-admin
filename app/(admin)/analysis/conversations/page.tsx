'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Archive, CalendarClock, ChevronRight, Download, FileText, Image as ImageIcon, RefreshCw, Search, SlidersHorizontal, Tags, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import {
  backfillConversations,
  exportConversationAnalysis,
  getAgents,
  getConversationAnalysis,
  getConversationAnalysisDetail,
  getConversationInsights,
  getConversationIngestStatus,
  type ConversationAnalysisParams,
  type ConversationIssue,
  type ConversationAnalysisTurn,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const timeZone = 'Asia/Bangkok'

const issueOptions = [
  'search_no_result',
  'low_confidence_search',
  'wrong_product_candidates',
  'selection_not_resolved',
  'tool_error',
  'model_timeout',
  'fallback_used',
  'slow_turn',
  'price_denied',
  'unsupported_capability',
  'language_quality',
  'duplicate_reply',
  'needs_user_refine',
  'unverified_price_guess',
  'reply_repetition',
  'multi_item_slow',
  'search_retry_loop',
  'wrong_agent_or_capability',
]

const reviewTargetOptions = [
  'SOUL',
  'MCP/search',
  'model/runtime',
  'user ambiguity',
  'business capability',
]

const triageTabs = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'soul', label: 'SOUL' },
  { id: 'mcp', label: 'MCP/Search' },
  { id: 'no_result', label: 'ไม่พบสินค้า' },
  { id: 'slow', label: 'ตอบช้า' },
  { id: 'price', label: 'เดาราคา' },
  { id: 'media', label: 'มีรูป' },
] as const

type TriageTab = typeof triageTabs[number]['id']

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

function formatDay(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

function formatPercent(value?: number | null) {
  if (!value) return '0%'
  return `${Math.round(value * 100)}%`
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

function issueVariant(tag: string) {
  if (['tool_error', 'model_timeout', 'unsupported_capability', 'unverified_price_guess', 'search_retry_loop'].includes(tag)) return 'destructive'
  if (['slow_turn', 'needs_user_refine', 'fallback_used', 'multi_item_slow', 'wrong_agent_or_capability'].includes(tag)) return 'secondary'
  return 'outline'
}

function evidencePreview(issue: ConversationIssue) {
  try {
    const keyword = issue.evidence?.keyword ? `keyword: ${String(issue.evidence.keyword)} · ` : ''
    const reason = issue.evidence?.reason ? `${String(issue.evidence.reason)} · ` : ''
    const tool = issue.evidence?.tool ? `tool: ${String(issue.evidence.tool)} · ` : ''
    const text = `${keyword}${tool}${reason}${JSON.stringify(issue.evidence)}`
    return shortText(text, 360)
  } catch {
    return shortText(String(issue.tag), 360)
  }
}

function daysBetween(from: string, to: string) {
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, (end - start) / (24 * 60 * 60 * 1000))
}

function MetricPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[128px] rounded-lg border bg-background px-3 py-2">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function TurnListSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="space-y-2 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function TurnRow({ turn, selected, onSelect }: { turn: ConversationAnalysisTurn; selected: boolean; onSelect: () => void }) {
  const primaryIssue = turn.primaryIssueTag || turn.issueTags?.[0]
  const extraIssueCount = Math.max(0, (turn.issueTags?.length ?? 0) - (primaryIssue ? 1 : 0))
  const primaryTarget = turn.primaryReviewTarget || turn.reviewTargets?.[0]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
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
            {primaryIssue ? (
              <Badge variant={selected ? 'secondary' : issueVariant(primaryIssue)} className={selected ? '' : 'max-w-[170px] truncate'}>
                {primaryIssue}
              </Badge>
            ) : null}
            {extraIssueCount > 0 ? <Badge variant="outline" className={selected ? 'border-white/30 text-white' : ''}>+{extraIssueCount} issues</Badge> : null}
            {turn.mediaCount ? (
              <Badge variant="outline" className={cn('gap-1', selected ? 'border-white/30 text-white' : '')}>
                <ImageIcon className="size-3" />
                รูป {turn.mediaCount}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium">{turn.userText || '(empty user message)'}</p>
          <div className={cn('mt-1 flex flex-wrap items-center gap-1.5 text-xs', selected ? 'text-white/70' : 'text-muted-foreground')}>
            <span>{turn.agentId || 'unknown'} · {turn.channel}</span>
            {turn.route ? <span>· {turn.route}</span> : null}
            {primaryTarget ? <span>· {primaryTarget}</span> : null}
            {turn.durationMs ? <span className="tabular-nums">· {formatMs(turn.durationMs)}</span> : null}
          </div>
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
  const [issueTag, setIssueTag] = useState('all')
  const [reviewTarget, setReviewTarget] = useState('all')
  const [hasToolError, setHasToolError] = useState(false)
  const [slowOnly, setSlowOnly] = useState(false)
  const [hasMedia, setHasMedia] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [triageTab, setTriageTab] = useState<TriageTab>('all')

  const params: ConversationAnalysisParams = {
    from: fromLocalInput(from),
    to: fromLocalInput(to),
    agent: agent === 'all' ? undefined : agent,
    channel: channel === 'all' ? undefined : channel,
    status: status === 'all' ? undefined : status,
    route: route === 'all' ? undefined : route,
    issueTag: issueTag === 'all' ? undefined : issueTag,
    reviewTarget: reviewTarget === 'all' ? undefined : reviewTarget,
    hasToolError: hasToolError || undefined,
    slowOnly: slowOnly || undefined,
    hasMedia: hasMedia || undefined,
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
  const { data: insights } = useQuery({
    queryKey: ['conversation-insights', baseParams],
    queryFn: () => getConversationInsights(baseParams),
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
      queryClient.invalidateQueries({ queryKey: ['conversation-insights'] })
      queryClient.invalidateQueries({ queryKey: ['conversation-ingest-status'] })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Backfill failed'),
  })

  const exportMutation = useMutation({
    mutationFn: async (request: { format?: 'csv' | 'jsonl' | 'markdown'; mode?: 'raw' | 'codex_review_pack' | 'issues_csv' | 'events_jsonl'; filename: string }) => {
      const blob = await exportConversationAnalysis({ ...baseParams, format: request.format, mode: request.mode })
      return { blob, filename: request.filename }
    },
    onSuccess: ({ blob, filename }) => {
      downloadBlob(blob, filename)
      toast.success('Export complete')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Export failed'),
  })

  const summary = data?.summary
  const insightSummary = insights?.summary
  const exportDisabled = exportTooWide || exportMutation.isPending || (summary?.count ?? 0) === 0
  const events = detail?.events ?? []
  const hasTrace = events.some(event => event.type === 'trace')
  const selectedIssues = detail?.turn?.issues ?? selectedTurn?.issues ?? []
  const groupedTurns = useMemo(() => {
    const groups: Array<{ day: string; turns: ConversationAnalysisTurn[] }> = []
    for (const turn of data?.turns ?? []) {
      const day = formatDay(turn.startedAt)
      const last = groups[groups.length - 1]
      if (!last || last.day !== day) {
        groups.push({ day, turns: [turn] })
      } else {
        last.turns.push(turn)
      }
    }
    return groups
  }, [data?.turns])

  function resetCursorAndRefetch() {
    setCursor(null)
    setSelectedId(null)
    void queryClient.invalidateQueries({ queryKey: ['conversation-analysis'] })
    void queryClient.invalidateQueries({ queryKey: ['conversation-insights'] })
  }

  function resetListState() {
    setCursor(null)
    setSelectedId(null)
  }

  function applyTriageTab(next: TriageTab) {
    setTriageTab(next)
    setCursor(null)
    setSelectedId(null)
    setIssueTag('all')
    setReviewTarget('all')
    setHasToolError(false)
    setSlowOnly(false)
    setHasMedia(false)
    if (next === 'soul') setReviewTarget('SOUL')
    if (next === 'mcp') setReviewTarget('MCP/search')
    if (next === 'no_result') setIssueTag('search_no_result')
    if (next === 'slow') setSlowOnly(true)
    if (next === 'price') setIssueTag('unverified_price_guess')
    if (next === 'media') setHasMedia(true)
  }

  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col gap-4 xl:h-[calc(100vh-96px)] xl:min-h-0 xl:overflow-hidden">
      <div className="shrink-0 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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

      <Card className="shrink-0">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-3 xl:grid-cols-[180px_180px_minmax(260px,1fr)_auto]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">เริ่ม</span>
              <Input type="datetime-local" value={from} onChange={e => { setFrom(e.target.value); resetListState() }} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">สิ้นสุด</span>
              <Input type="datetime-local" value={to} onChange={e => { setTo(e.target.value); resetListState() }} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">ค้นหา</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
                <Input className="pl-8" value={keyword} onChange={e => { setKeyword(e.target.value); resetListState() }} placeholder="ค้นคำถาม, คำตอบ, tool หรือ turn id" />
              </div>
            </label>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={resetCursorAndRefetch}>ใช้ตัวกรอง</Button>
              <Button type="button" variant="outline" onClick={() => setFiltersOpen(v => !v)}>
                <SlidersHorizontal className="size-4" />
                ตัวกรองขั้นสูง
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {triageTabs.map(tab => (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={triageTab === tab.id ? 'default' : 'outline'}
                onClick={() => applyTriageTab(tab.id)}
              >
                {tab.id === 'media' ? <ImageIcon className="size-3.5" /> : null}
                {tab.label}
              </Button>
            ))}
          </div>

          {filtersOpen ? (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Agent</span>
                <Select value={agent} onValueChange={v => { setAgent(v || 'all'); resetListState() }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Channel</span>
                <Select value={channel} onValueChange={v => { setChannel(v || 'all'); resetListState() }}>
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
                <Select value={status} onValueChange={v => { setStatus(v || 'all'); resetListState() }}>
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
                <Select value={route} onValueChange={v => { setRoute(v || 'all'); resetListState() }}>
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
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Issue tag</span>
                <Select value={issueTag} onValueChange={v => { setIssueTag(v || 'all'); resetListState(); setTriageTab('all') }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {issueOptions.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Review target</span>
                <Select value={reviewTarget} onValueChange={v => { setReviewTarget(v || 'all'); resetListState(); setTriageTab('all') }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {reviewTargetOptions.map(target => <SelectItem key={target} value={target}>{target}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex flex-wrap items-end gap-2 xl:col-span-6">
                <Button type="button" variant={hasToolError ? 'default' : 'outline'} onClick={() => { setHasToolError(v => !v); resetListState(); setTriageTab('all') }}>
                  Tool error
                </Button>
                <Button type="button" variant={slowOnly ? 'default' : 'outline'} onClick={() => { setSlowOnly(v => !v); resetListState(); setTriageTab('all') }}>
                  Slow only
                </Button>
                <Button type="button" variant={hasMedia ? 'default' : 'outline'} onClick={() => { setHasMedia(v => !v); resetListState(); setTriageTab('all') }}>
                  <ImageIcon className="size-4" />
                  มีรูป
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              variant="outline"
              disabled={exportDisabled}
              onClick={() => exportMutation.mutate({ mode: 'codex_review_pack', filename: 'conversation-codex-review-pack.md' })}
              title={exportTooWide ? 'Export จำกัดสูงสุด 31 วันต่อครั้ง' : undefined}
            >
              <FileText className="size-4" />
              Export for Codex
            </Button>
            <Button variant="outline" disabled={exportDisabled} onClick={() => exportMutation.mutate({ mode: 'issues_csv', filename: 'conversation-issues.csv' })}>Issues CSV</Button>
            <Button variant="outline" disabled={exportDisabled} onClick={() => exportMutation.mutate({ mode: 'events_jsonl', filename: 'conversation-events.jsonl' })}>Events JSONL</Button>
            <Button variant="ghost" disabled={exportDisabled} onClick={() => exportMutation.mutate({ mode: 'raw', format: 'csv', filename: 'conversation-history.csv' })}>
              <Download className="size-4" />
              Raw CSV
            </Button>
            {exportTooWide ? <span className="text-xs text-amber-700">Export จำกัดสูงสุด 31 วันต่อครั้ง</span> : null}
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

      <div className="shrink-0 rounded-xl border bg-card p-2">
        <div className="flex flex-wrap items-stretch gap-2">
          <MetricPill label="Turns" value={String(summary?.count ?? 0)} hint={`${summary?.uniqueUsers ?? 0} users`} />
          <MetricPill label="Flagged" value={String(insightSummary?.issueTurns ?? 0)} hint={`${formatPercent(insightSummary?.issueRate)} issue rate`} />
          <MetricPill label="No result" value={String(insightSummary?.noResultTurns ?? 0)} hint="search no result" />
          <MetricPill label="Slow p95" value={formatMs(insightSummary?.slowP95Ms ?? summary?.p95DurationMs)} hint={`${insightSummary?.slowTurns ?? 0} slow turns`} />
          <MetricPill label="Tool errors" value={String(insightSummary?.toolErrorTurns ?? 0)} hint="MCP/runtime evidence" />
          <MetricPill label="Agents review" value={String(insightSummary?.agentsNeedingReview ?? 0)} hint={`cost ${formatMoney(summary?.totalCost)}`} />
          <details className="min-w-[260px] flex-1 rounded-lg border bg-background px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Tags className="size-4 text-muted-foreground" />
                Insight สำหรับปรับ SOUL/MCP
              </span>
              <Badge variant="outline">{insights?.topIssueTags.length ?? 0} tags</Badge>
            </summary>
            <div className="mt-3 grid gap-3 border-t pt-3 lg:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Top issue tags</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insights?.topIssueTags.length ? insights.topIssueTags.slice(0, 8).map(item => (
                    <Badge key={item.key} variant={issueVariant(item.key)}>{item.key} · {item.count}</Badge>
                  )) : <span className="text-sm text-muted-foreground">ยังไม่มี issue ที่ถูก flag</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Top failed keywords</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insights?.topFailedKeywords.length ? insights.topFailedKeywords.slice(0, 8).map(item => (
                    <Badge key={item.key} variant="outline" className="max-w-full truncate">{item.key} · {item.count}</Badge>
                  )) : <span className="text-sm text-muted-foreground">ยังไม่พบ keyword ที่ล้มเหลวซ้ำ</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Review target</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insights?.reviewTargets.length ? insights.reviewTargets.slice(0, 8).map(item => (
                    <Badge key={item.key} variant="secondary">{item.key} · {item.count}</Badge>
                  )) : <span className="text-sm text-muted-foreground">ยังไม่มี target ที่ต้อง review</span>}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="grid min-h-[720px] flex-1 overflow-hidden rounded-xl border bg-card xl:min-h-0 xl:grid-cols-[minmax(520px,0.42fr)_minmax(0,1fr)]">
        <section className="flex min-h-[420px] flex-col overflow-hidden border-b xl:min-h-0 xl:border-b-0 xl:border-r">
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? <TurnListSkeleton /> : null}
            {!isLoading && data?.turns.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">ยังไม่มีข้อมูลย้อนหลังในช่วงนี้</p>
                <p className="mt-1">ลองขยายช่วงวันที่ หรือกด Backfill 7 วันเพื่อนำ log ที่ยังมีอยู่เข้า database</p>
              </div>
            ) : null}
            {!isLoading && groupedTurns.map(group => (
              <div key={group.day}>
                <div className="sticky top-0 z-10 border-b bg-muted/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                  {group.day}
                </div>
                {group.turns.map(turn => (
                  <TurnRow key={turn.id} turn={turn} selected={turn.id === selectedTurn?.id} onSelect={() => setSelectedId(turn.id)} />
                ))}
              </div>
            ))}
            {!isLoading && data?.hasMore ? (
              <div className="p-3">
                <Button className="w-full" variant="outline" onClick={() => setCursor(data.nextCursor)}>
                  โหลดหน้าถัดไป
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="min-h-[520px] min-w-0 overflow-y-auto overscroll-contain xl:min-h-0">
          {!selectedTurn ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              เลือก conversation เพื่อดู transcript
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-col gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(selectedTurn.status)}>{selectedTurn.status}</Badge>
                    <Badge variant="outline">{selectedTurn.agentId || 'unknown'}</Badge>
                    <Badge variant="outline">{selectedTurn.channel}</Badge>
                    {selectedTurn.mediaCount ? (
                      <Badge variant="outline" className="gap-1">
                        <ImageIcon className="size-3" />
                        รูป {selectedTurn.mediaCount}
                      </Badge>
                    ) : null}
                    {(selectedTurn.reviewTargets ?? []).map(target => <Badge key={target} variant="secondary">{target}</Badge>)}
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

              {selectedIssues.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2">
                    <Tags className="size-4 text-amber-700 dark:text-amber-300" />
                    <p className="text-sm font-medium text-amber-950 dark:text-amber-100">Why flagged</p>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {selectedIssues.map(issue => (
                      <div key={issue.tag} className="rounded-md border bg-background p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={issueVariant(issue.tag)}>{issue.tag}</Badge>
                          <Badge variant="outline">{issue.reviewTarget}</Badge>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{evidencePreview(issue)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <details className="rounded-lg border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Raw timeline</p>
                    <p className="text-xs text-muted-foreground">Trace แสดงเฉพาะข้อมูลที่ runtime บันทึกไว้จริง</p>
                  </div>
                  <Badge variant="outline">{events.length} events</Badge>
                </summary>
                <div className="divide-y border-t">
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
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
