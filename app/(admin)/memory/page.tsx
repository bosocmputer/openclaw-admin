'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, CheckCircle2, FileText, Lightbulb, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import {
  applyMemoryLearningCandidate,
  approveMemoryLearningCandidate,
  createMemoryLearningCandidate,
  getDailyMemoryContent,
  getDreamsContent,
  getMemoryBackups,
  getMemoryContent,
  getMemoryLearningCandidates,
  getMemoryStatus,
  rejectMemoryLearningCandidate,
  rollbackMemoryBackup,
  type MemoryAgentStatus,
  type MemoryBackup,
  type MemoryLearningCandidate,
  type MemoryLearningTargetType,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type MemoryTab = 'overview' | 'learning' | 'files' | 'backups'

const targetOptions: Array<{ value: MemoryLearningTargetType; label: string; description: string }> = [
  { value: 'memory', label: 'MEMORY.md', description: 'ความจำเฉพาะ agent หรือร้านที่ admin ยืนยันแล้ว' },
  { value: 'business_profile', label: 'Business Profile', description: 'บริบทธุรกิจและ pattern ของร้าน' },
  { value: 'soul', label: 'SOUL', description: 'กติกาการตอบและ safety/tool contract' },
  { value: 'mcp_search', label: 'MCP/Search', description: 'คำพ้อง, normalization, หรือ search behavior' },
  { value: 'model_runtime', label: 'Model/Runtime', description: 'model timeout, latency, fallback หรือ runtime behavior' },
]

const learningSteps = [
  {
    title: '1. ดูสิ่งที่เกิดขึ้นจริง',
    body: 'ใช้บทสนทนา, issue tags, MEMORY.md และ DREAMS.md เป็นหลักฐาน ไม่ให้ AI เดาเอง',
  },
  {
    title: '2. สร้างรายการให้ตรวจ',
    body: 'สิ่งที่น่าจำหรือควรปรับจะเข้า Learning Review ก่อนเสมอ',
  },
  {
    title: '3. Admin เลือกว่าจะลงชั้นไหน',
    body: 'MEMORY.md ใช้ตอบจริง ส่วน Business Profile, SOUL, MCP/Search และ Model/Runtime เป็นงาน review ต่อ',
  },
]

function formatChars(n = 0) {
  if (n > 1000) return `${(n / 1000).toFixed(1)}k ตัวอักษร`
  return `${n} ตัวอักษร`
}

function formatTokens(n?: number) {
  if (!n) return '~0 tokens'
  if (n > 1000) return `~${(n / 1000).toFixed(1)}k tokens`
  return `~${n} tokens`
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatBytes(value?: number) {
  if (!value) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
  return `${Math.round(value / (1024 * 102.4)) / 10} MB`
}

function targetLabel(target: string) {
  return targetOptions.find(option => option.value === target)?.label || target
}

function statusVariant(status: string) {
  if (status === 'applied') return 'default'
  if (status === 'approved') return 'secondary'
  if (status === 'rejected') return 'destructive'
  return 'outline'
}

function shortPreview(value?: string, max = 520) {
  const text = String(value || '').trim()
  if (!text) return ''
  const lines = text.split('\n').slice(0, 8).join('\n')
  return lines.length > max ? `${lines.slice(0, max)}…` : lines
}

function sizeWarningText(agent: MemoryAgentStatus) {
  if (agent.memory.sizeWarning === 'block') return 'MEMORY.md ใหญ่มาก ควรสรุปก่อนเพิ่ม'
  if (agent.memory.sizeWarning === 'warn') return 'MEMORY.md ใกล้ใหญ่เกิน budget'
  if (agent.memory.injectedLikely === 'truncated') return 'อาจถูกตัดบางส่วนตอนส่งเข้า model'
  return 'ขนาดยังอยู่ในช่วงปลอดภัย'
}

function evidenceFromText(text: string) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map(line => ({ note: line }))
}

function sourceIdsFromText(text: string) {
  return text
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 50)
}

function memoryTabFromSearch(): MemoryTab | null {
  const tabParam = new URLSearchParams(window.location.search).get('tab')
  if (tabParam === 'overview' || tabParam === 'learning' || tabParam === 'files' || tabParam === 'backups') return tabParam
  return null
}

export default function MemoryPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<MemoryTab>('overview')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [candidateStatus, setCandidateStatus] = useState('pending')
  const [viewDialog, setViewDialog] = useState<{ title: string; content: string; loading?: boolean } | null>(null)
  const [applyCandidate, setApplyCandidate] = useState<MemoryLearningCandidate | null>(null)
  const [rollbackBackup, setRollbackBackup] = useState<MemoryBackup | null>(null)
  const [form, setForm] = useState({
    agentId: '',
    targetType: 'memory' as MemoryLearningTargetType,
    summary: '',
    evidenceText: '',
    sourceTurnIdsText: '',
    confidence: '0.8',
  })

  useEffect(() => {
    const nextTab = memoryTabFromSearch()
    if (!nextTab) return undefined
    const timeout = window.setTimeout(() => setTab(nextTab), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['memory-status'],
    queryFn: getMemoryStatus,
    refetchInterval: 30000,
  })

  const effectiveAgentId = selectedAgentId || agents[0]?.agentId || ''
  const candidateAgentId = form.agentId || effectiveAgentId

  const { data: candidateData, isLoading: candidatesLoading } = useQuery({
    queryKey: ['memory-learning-candidates', candidateStatus, effectiveAgentId],
    queryFn: () => getMemoryLearningCandidates({
      status: candidateStatus === 'all' ? undefined : candidateStatus,
      agentId: effectiveAgentId || undefined,
      limit: 200,
    }),
    retry: false,
  })

  const { data: backupData } = useQuery({
    queryKey: ['memory-backups', effectiveAgentId],
    queryFn: () => getMemoryBackups(effectiveAgentId),
    enabled: Boolean(effectiveAgentId),
    retry: false,
  })

  const summary = useMemo(() => {
    const memoryCount = agents.filter(agent => agent.memory.exists).length
    const dreamsCount = agents.filter(agent => agent.dreams.exists).length
    const dailyCount = agents.reduce((sum, agent) => sum + (agent.dailyMemory?.fileCount || 0), 0)
    const warningCount = agents.filter(agent => agent.memory.sizeWarning === 'warn' || agent.memory.sizeWarning === 'block' || agent.memory.injectedLikely === 'truncated').length
    return { memoryCount, dreamsCount, dailyCount, warningCount }
  }, [agents])

  async function openView(title: string, loader: () => Promise<string>) {
    setViewDialog({ title, content: '', loading: true })
    try {
      const content = await loader()
      setViewDialog({ title, content })
    } catch {
      setViewDialog({ title, content: 'โหลดไม่สำเร็จ' })
    }
  }

  function invalidateMemory() {
    queryClient.invalidateQueries({ queryKey: ['memory-status'] })
    queryClient.invalidateQueries({ queryKey: ['memory-learning-candidates'] })
    queryClient.invalidateQueries({ queryKey: ['memory-backups'] })
  }

  const createMutation = useMutation({
    mutationFn: () => createMemoryLearningCandidate({
      agentId: candidateAgentId,
      targetType: form.targetType,
      summary: form.summary.trim(),
      evidence: evidenceFromText(form.evidenceText),
      sourceTurnIds: sourceIdsFromText(form.sourceTurnIdsText),
      confidence: Number(form.confidence),
    }),
    onSuccess: candidate => {
      toast.success(candidate.deduped ? 'มี candidate นี้อยู่แล้ว' : 'สร้าง Learning Candidate แล้ว')
      setForm(f => ({ ...f, summary: '', evidenceText: '', sourceTurnIdsText: '' }))
      invalidateMemory()
      setTab('learning')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'สร้าง candidate ไม่สำเร็จ'),
  })

  const approveMutation = useMutation({
    mutationFn: approveMemoryLearningCandidate,
    onSuccess: () => {
      toast.success('อนุมัติ candidate แล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'อนุมัติไม่สำเร็จ'),
  })

  const rejectMutation = useMutation({
    mutationFn: rejectMemoryLearningCandidate,
    onSuccess: () => {
      toast.success('Reject candidate แล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Reject ไม่สำเร็จ'),
  })

  const applyMutation = useMutation({
    mutationFn: (candidate: MemoryLearningCandidate) => applyMemoryLearningCandidate(candidate.id),
    onSuccess: result => {
      toast.success('Apply เข้า MEMORY.md แล้ว')
      setApplyCandidate(null)
      setViewDialog({
        title: 'Apply result',
        content: JSON.stringify(result.result, null, 2),
      })
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Apply ไม่สำเร็จ'),
  })

  const rollbackMutation = useMutation({
    mutationFn: (backup: MemoryBackup) => rollbackMemoryBackup(effectiveAgentId, backup.backupId),
    onSuccess: result => {
      toast.success('Rollback MEMORY.md แล้ว')
      setRollbackBackup(null)
      setViewDialog({ title: 'Rollback result', content: JSON.stringify(result, null, 2) })
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Rollback ไม่สำเร็จ'),
  })

  const candidates = candidateData?.candidates ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memory Learning</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            เลือกสิ่งที่ chatbot ควรเรียนรู้จากบทสนทนาจริง แล้วให้ admin ตรวจทานก่อนนำไปใช้กับ agent
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={summary.warningCount ? 'secondary' : 'outline'}>{summary.warningCount} size warnings</Badge>
          <Badge variant="outline">{summary.memoryCount} MEMORY.md</Badge>
          <Badge variant="outline">{summary.dreamsCount} DREAMS.md</Badge>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">Learning Loop ทำงานอย่างไร</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                ระบบนี้ไม่ train model และไม่เขียนความจำให้อัตโนมัติ ทุกอย่างต้องผ่านคิวตรวจของ admin ก่อน
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => setTab('learning')}>
              <Lightbulb className="size-4" />
              เปิด Learning Review
            </Button>
          </div>
        </div>
        <div className="grid gap-0 divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {learningSteps.map(step => (
            <div key={step.title} className="p-4">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Tabs value={tab} onValueChange={value => setTab(value as MemoryTab)} className="gap-4">
        <TabsList className="flex w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="learning">Learning Review</TabsTrigger>
          <TabsTrigger value="files">Memory Files</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium">ใช้ตอบจริง</p>
                <p className="mt-2 text-2xl font-semibold">{summary.memoryCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">MEMORY.md คือความจำที่ runtime อ่านเข้า context ของ agent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium">บันทึกระหว่างวัน</p>
                <p className="mt-2 text-2xl font-semibold">{summary.dailyCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">memory/*.md ใช้ทบทวนและหา insight ไม่ควรใส่ทั้งหมดเข้า prompt</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium">ไดอารี่สำหรับ review</p>
                <p className="mt-2 text-2xl font-semibold">{summary.dreamsCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">DREAMS.md เป็นข้อสังเกตหลังบ้าน ยังไม่ใช่ความจริงที่ chatbot ควรจำ</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            {isLoading ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">กำลังโหลด memory status...</div>
            ) : null}
            {agents.map(agent => (
              <Card key={agent.agentId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-mono">{agent.agentId}</CardTitle>
                    <Badge variant={agent.dreaming.enabled ? 'default' : 'secondary'}>
                      {agent.dreaming.enabled ? 'Dreaming เปิด' : 'Dreaming ปิด'}
                    </Badge>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">{agent.workspace}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">MEMORY.md</p>
                      <Badge variant={agent.memory.sizeWarning === 'ok' ? 'outline' : 'secondary'}>{agent.memory.injectedLikely || 'missing'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {agent.memory.exists ? `${formatChars(agent.memory.sizeChars)} · ${formatTokens(agent.memory.estimatedTokens)}` : 'ยังไม่มีไฟล์'}
                    </p>
                    <p className="mt-2 text-xs">{sizeWarningText(agent)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{agent.dreams.canonicalName || 'DREAMS.md'}</p>
                      <Badge variant={agent.dreams.exists ? 'outline' : 'secondary'}>{agent.dreams.exists ? 'มีไฟล์' : 'ยังว่าง'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {agent.dreams.exists ? `${formatChars(agent.dreams.sizeChars)} · review diary` : 'สร้างหลัง dreaming phase มี output'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="learning" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">เพิ่มรายการให้ตรวจ</CardTitle>
                <p className="text-sm text-muted-foreground">ใช้เมื่อเจอ pattern จากบทสนทนาที่ควรจำหรือควรส่งต่อทีมปรับระบบ</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Agent</span>
                  <Select value={candidateAgentId} onValueChange={value => setForm(f => ({ ...f, agentId: value || '' }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="เลือก agent" /></SelectTrigger>
                    <SelectContent>
                      {agents.map(agent => <SelectItem key={agent.agentId} value={agent.agentId}>{agent.agentId}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">ควรนำไปปรับส่วนไหน</span>
                  <Select value={form.targetType} onValueChange={value => setForm(f => ({ ...f, targetType: (value || 'memory') as MemoryLearningTargetType }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {targetOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{targetOptions.find(option => option.value === form.targetType)?.description}</p>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">สิ่งที่ควรเรียนรู้</span>
                  <Textarea
                    rows={4}
                    value={form.summary}
                    onChange={event => setForm(f => ({ ...f, summary: event.target.value }))}
                    placeholder="เช่น ลูกค้าร้านนี้มักถามอะไหล่ด้วยชื่ออะไหล่ + รุ่นรถ + ตำแหน่งซ้าย/ขวา"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">หลักฐาน</span>
                  <Textarea
                    rows={3}
                    value={form.evidenceText}
                    onChange={event => setForm(f => ({ ...f, evidenceText: event.target.value }))}
                    placeholder="หนึ่งบรรทัดต่อหลักฐาน เช่น keyword, issue tag, tool result"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Source turn ids</span>
                  <Input
                    value={form.sourceTurnIdsText}
                    onChange={event => setForm(f => ({ ...f, sourceTurnIdsText: event.target.value }))}
                    placeholder="turn id คั่นด้วย comma หรือขึ้นบรรทัดใหม่"
                  />
                </label>
                <Button
                  className="w-full"
                  disabled={!candidateAgentId || !form.summary.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  <Lightbulb className="size-4" />
                  สร้างรายการตรวจ
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-base">รายการที่รอ admin ตรวจ</CardTitle>
                    <p className="text-sm text-muted-foreground">อนุมัติก่อนเสมอ เฉพาะ MEMORY.md เท่านั้นที่ระบบเขียนให้อัตโนมัติใน v1</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={effectiveAgentId} onValueChange={value => setSelectedAgentId(value || '')}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {agents.map(agent => <SelectItem key={agent.agentId} value={agent.agentId}>{agent.agentId}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={candidateStatus} onValueChange={value => setCandidateStatus(value || 'pending')}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="approved">approved</SelectItem>
                        <SelectItem value="applied">applied</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                        <SelectItem value="all">all</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {candidateData && !candidateData.enabled ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Learning Review ถูกปิดไว้ ตั้ง `MEMORY_LEARNING_REVIEW_ENABLED=1` ใน openclaw-api ก่อนใช้งาน
                  </div>
                ) : null}
                {candidatesLoading ? <div className="rounded-lg border p-4 text-sm text-muted-foreground">กำลังโหลด candidates...</div> : null}
                {!candidatesLoading && !candidates.length ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    ยังไม่มีรายการในตัวกรองนี้ สร้างจากฟอร์มด้านซ้าย หรือจากหน้า Conversation Analysis
                  </div>
                ) : null}
                <div className="space-y-3">
                  {candidates.map(candidate => (
                    <div key={candidate.id} className="rounded-lg border p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusVariant(candidate.status)}>{candidate.status}</Badge>
                            <Badge variant="outline">{candidate.agentId}</Badge>
                            <Badge variant="secondary">{targetLabel(candidate.targetType)}</Badge>
                            {candidate.confidence !== null ? <Badge variant="outline">{Math.round(candidate.confidence * 100)}%</Badge> : null}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{candidate.summary}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {candidate.sourceTurnIds.length ? `source: ${candidate.sourceTurnIds.slice(0, 3).join(', ')}` : 'no source turn'} · updated {formatDateTime(candidate.updatedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {candidate.status === 'pending' ? (
                            <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(candidate.id)} disabled={approveMutation.isPending}>
                              <CheckCircle2 className="size-4" />
                              Approve
                            </Button>
                          ) : null}
                          {candidate.status === 'approved' ? (
                            <Button size="sm" onClick={() => setApplyCandidate(candidate)} disabled={candidate.targetType !== 'memory'}>
                              <ShieldCheck className="size-4" />
                              Apply
                            </Button>
                          ) : null}
                          {candidate.status !== 'rejected' && candidate.status !== 'applied' ? (
                            <Button size="sm" variant="ghost" onClick={() => rejectMutation.mutate(candidate.id)} disabled={rejectMutation.isPending}>
                              <XCircle className="size-4" />
                              Reject
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {candidate.targetType !== 'memory' ? (
                        <div className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                          Target นี้เป็นรายการให้ทีม review ต่อ ยังไม่เขียนเข้า agent อัตโนมัติ เพื่อกันจำผิดชั้นหรือแก้ระบบผิดจุด
                        </div>
                      ) : null}
                      {candidate.evidence.length ? (
                        <details className="mt-3 rounded-md border bg-muted/20">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Evidence</summary>
                          <pre className="max-h-56 overflow-auto border-t p-3 text-xs">{JSON.stringify(candidate.evidence, null, 2)}</pre>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
            {agents.map(agent => (
              <Card key={agent.agentId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-mono">{agent.agentId}</CardTitle>
                  <p className="break-all text-xs text-muted-foreground">{agent.workspace}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">MEMORY.md</p>
                        <p className="text-xs text-muted-foreground">{agent.memory.exists ? formatChars(agent.memory.sizeChars) : 'ยังไม่มีไฟล์'}</p>
                      </div>
                      {agent.memory.exists ? (
                        <Button variant="outline" size="sm" onClick={() => openView(`${agent.agentId} — MEMORY.md`, () => getMemoryContent(agent.agentId))}>อ่าน</Button>
                      ) : null}
                    </div>
                    {agent.memory.preview ? <pre className="mt-2 max-h-28 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs leading-relaxed">{shortPreview(agent.memory.preview)}</pre> : null}
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{agent.dreams.canonicalName || 'DREAMS.md'}</p>
                        <p className="text-xs text-muted-foreground">{agent.dreams.exists ? formatChars(agent.dreams.sizeChars) : 'ยังไม่มีไฟล์'}</p>
                      </div>
                      {agent.dreams.exists ? (
                        <Button variant="outline" size="sm" onClick={() => openView(`${agent.agentId} — ${agent.dreams.canonicalName || 'DREAMS.md'}`, () => getDreamsContent(agent.agentId))}>อ่าน</Button>
                      ) : null}
                    </div>
                    {agent.dreams.preview ? <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs leading-relaxed">{shortPreview(agent.dreams.preview, 360)}</pre> : null}
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">memory/*.md</p>
                        <p className="text-xs text-muted-foreground">{agent.dailyMemory?.fileCount || 0} files · {formatChars(agent.dailyMemory?.totalChars || 0)}</p>
                      </div>
                    </div>
                    <div className="mt-2 max-h-56 space-y-1 overflow-auto">
                      {(agent.dailyMemory?.files || []).map(file => (
                        <div key={file} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted">
                          <span className="truncate font-mono text-xs">{file}</span>
                          <Button variant="ghost" size="sm" onClick={() => openView(`${agent.agentId} — ${file}`, () => getDailyMemoryContent(agent.agentId, file))}>อ่าน</Button>
                        </div>
                      ))}
                      {!agent.dailyMemory?.files?.length ? <p className="text-xs text-muted-foreground">ยังไม่มี daily memory</p> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="backups" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">MEMORY.md Backups</CardTitle>
                  <p className="text-sm text-muted-foreground">backup ถูกสร้างก่อน apply learning candidate หรือ rollback</p>
                </div>
                <Select value={effectiveAgentId} onValueChange={value => setSelectedAgentId(value || '')}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agents.map(agent => <SelectItem key={agent.agentId} value={agent.agentId}>{agent.agentId}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!backupData?.backups.length ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  ยังไม่มี backup จาก Learning Review สำหรับ agent นี้
                </div>
              ) : null}
              <div className="space-y-2">
                {backupData?.backups.map(backup => (
                  <div key={backup.backupId} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-sm">{backup.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(backup.createdAt)} · {formatBytes(backup.sizeBytes)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setRollbackBackup(backup)}>
                      <ArchiveRestore className="size-4" />
                      Rollback
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewDialog} onOpenChange={open => { if (!open) setViewDialog(null) }}>
        <DialogContent className="grid max-h-[86vh] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4" />
              {viewDialog?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-auto overscroll-contain rounded-lg border bg-muted p-3">
            {viewDialog?.loading ? (
              <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">{viewDialog?.content || '(ไฟล์ว่างเปล่า)'}</pre>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!applyCandidate} onOpenChange={open => { if (!open) setApplyCandidate(null) }}>
        <DialogContent className="max-w-xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Apply เข้า MEMORY.md</DialogTitle>
          </DialogHeader>
          {applyCandidate ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">จะเพิ่มใน managed section</p>
                <p className="mt-2 whitespace-pre-wrap">{applyCandidate.summary}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                ระบบจะสร้าง backup ก่อนเขียน และจะไม่ทับ section ที่ admin/user เขียนเอง
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyCandidate(null)}>ยกเลิก</Button>
            <Button onClick={() => applyCandidate && applyMutation.mutate(applyCandidate)} disabled={applyMutation.isPending}>
              <ShieldCheck className="size-4" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rollbackBackup} onOpenChange={open => { if (!open) setRollbackBackup(null) }}>
        <DialogContent className="max-w-xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Rollback MEMORY.md</DialogTitle>
          </DialogHeader>
          {rollbackBackup ? (
            <div className="space-y-3 text-sm">
              <p>ต้องการ restore backup นี้ให้ agent <strong>{effectiveAgentId}</strong> ใช่ไหม?</p>
              <div className="rounded-lg border bg-muted p-3 font-mono text-xs">{rollbackBackup.fileName}</div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                ระบบจะ backup ไฟล์ปัจจุบันอีกชุดก่อน rollback
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackBackup(null)}>ยกเลิก</Button>
            <Button onClick={() => rollbackBackup && rollbackMutation.mutate(rollbackBackup)} disabled={rollbackMutation.isPending}>
              <RotateCcw className="size-4" />
              Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
