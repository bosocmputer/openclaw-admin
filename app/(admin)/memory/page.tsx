'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveRestore,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  FileText,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  applyMemoryAutoLearn,
  blockMemoryRelearn,
  cleanupMemory,
  createAgentMemory,
  deleteAgentMemory,
  getAgentMemories,
  getDailyMemoryContent,
  getDreamsContent,
  getMemoryBackups,
  getMemoryContent,
  getMemoryObservations,
  getMemoryPolicies,
  getMemoryStatus,
  promoteMemoryObservation,
  putMemoryPolicy,
  rollbackMemoryBackup,
  updateAgentMemory,
  type AgentMemory,
  type AgentMemoryStatus,
  type MemoryBackup,
  type MemoryObservation,
  type MemoryPolicyMode,
  type MemoryScope,
  type MemoryType,
  type MemoryAutoApplyResult,
  type MemoryCleanupResult,
  type MemoryHealth,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type MemoryTab = 'active' | 'search_hints' | 'description_suggestions' | 'soft' | 'blocked' | 'deleted' | 'sources' | 'settings' | 'files' | 'backups'

const memoryTypeOptions: Array<{ value: MemoryType; label: string; help: string }> = [
  { value: 'terminology', label: 'คำศัพท์/คำพ้อง', help: 'คำเรียก, spelling, alias ที่ช่วยเข้าใจคำถาม' },
  { value: 'preference', label: 'Preference', help: 'ความชอบหรือรูปแบบที่ลูกค้าหรือ agent ใช้ซ้ำ' },
  { value: 'workflow_hint', label: 'Workflow hint', help: 'ข้อสังเกตที่ช่วยให้ flow ตอบดีขึ้น' },
  { value: 'search_hint', label: 'Search hint', help: 'คำช่วยค้นที่ต้อง verify ด้วย MCP/Search ทุกครั้ง' },
  { value: 'description_suggestion', label: 'SML description suggestion', help: 'คำแนะนำให้ staff เติมช่อง description ใน SML ERP' },
  { value: 'faq_pattern', label: 'FAQ pattern', help: 'รูปแบบคำถามที่เจอบ่อย' },
  { value: 'entity_alias', label: 'Entity alias', help: 'ชื่อเรียกสินค้า/หมวด/ลูกค้าแบบกลาง ๆ' },
  { value: 'staff_instruction', label: 'Staff instruction', help: 'สิ่งที่ staff/admin สอนอย่างชัดเจน' },
  { value: 'blocked_fact', label: 'Blocked fact', help: 'เรื่องที่ห้ามจำหรือยังไม่ปลอดภัย' },
]

const scopeOptions: Array<{ value: MemoryScope; label: string }> = [
  { value: 'session', label: 'เฉพาะ session' },
  { value: 'contact', label: 'เฉพาะ contact' },
  { value: 'agent', label: 'เฉพาะ agent' },
  { value: 'business', label: 'ทั้งธุรกิจ' },
  { value: 'global', label: 'ทุก agent' },
]

const policyModes: Array<{ value: MemoryPolicyMode; label: string; help: string }> = [
  { value: 'off', label: 'ปิด', help: 'ไม่เก็บ observation และไม่ใช้ memory ใหม่' },
  { value: 'observe_only', label: 'Observe only', help: 'เก็บ signal ให้ดู แต่ยังไม่ใช้ตอบจริง' },
  { value: 'safe_auto', label: 'Safe auto', help: 'ใช้ memory low-risk ตาม policy' },
  { value: 'manual_review', label: 'Manual review', help: 'ใช้เฉพาะ memory ที่ admin สร้างหรือ promote' },
]

const safeAutoTypes: MemoryType[] = ['terminology', 'preference', 'workflow_hint', 'faq_pattern', 'entity_alias', 'staff_instruction']

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatChars(value = 0) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k chars`
  return `${value} chars`
}

function formatBytes(value?: number) {
  if (!value) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
  return `${Math.round(value / (1024 * 102.4)) / 10} MB`
}

function defaultMemoryHealth(): MemoryHealth {
  return {
    noiseCount: 0,
    duplicateCount: 0,
    dynamicFactCount: 0,
    vagueTeachingCount: 0,
    overBudget: false,
    injectedChars: 0,
    activeButNotInjectedCount: 0,
    totalActiveChars: 0,
  }
}

function cleanupIssueCount(health?: MemoryHealth) {
  if (!health) return 0
  return (health.noiseCount || 0)
    + (health.duplicateCount || 0)
    + (health.dynamicFactCount || 0)
    + (health.vagueTeachingCount || 0)
}

function statusVariant(status: string) {
  if (status === 'active' || status === 'promoted') return 'default'
  if (status === 'soft' || status === 'observed') return 'secondary'
  if (status === 'blocked' || status === 'deleted') return 'destructive'
  return 'outline'
}

function isHighRiskObservation(observation: MemoryObservation) {
  return observation.risk === 'high' || observation.type === 'blocked_fact' || observation.recommendedAction === 'block_truth'
}

function typeLabel(type: string) {
  return memoryTypeOptions.find(option => option.value === type)?.label || type
}

function scopeLabel(scope: string) {
  return scopeOptions.find(option => option.value === scope)?.label || scope
}

function modeLabel(mode?: string) {
  return policyModes.find(option => option.value === mode)?.label || mode || 'Observe only'
}

function shortText(value?: string, max = 520) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function tabStatus(tab: MemoryTab): AgentMemoryStatus | undefined {
  if (tab === 'active' || tab === 'soft' || tab === 'blocked' || tab === 'deleted') return tab
  return undefined
}

function tabForcedType(tab: MemoryTab): MemoryType | undefined {
  if (tab === 'search_hints') return 'search_hint'
  if (tab === 'description_suggestions') return 'description_suggestion'
  return undefined
}

function tabUsesMemoryList(tab: MemoryTab) {
  return Boolean(tabStatus(tab) || tabForcedType(tab))
}

function tabFromSearch(): MemoryTab | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('tab')
  if (value === 'active' || value === 'search_hints' || value === 'description_suggestions' || value === 'soft' || value === 'blocked' || value === 'deleted' || value === 'sources' || value === 'settings' || value === 'files' || value === 'backups') return value
  return null
}

export default function MemoryPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<MemoryTab>(() => tabFromSearch() || 'active')
  const [agentId, setAgentId] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [viewDialog, setViewDialog] = useState<{ title: string; content: string; loading?: boolean } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AgentMemory | null>(null)
  const [rollbackBackup, setRollbackBackup] = useState<MemoryBackup | null>(null)
  const [cleanupResult, setCleanupResult] = useState<MemoryCleanupResult | null>(null)
  const [memoryForm, setMemoryForm] = useState({
    type: 'workflow_hint' as MemoryType,
    scope: 'agent' as MemoryScope,
    status: 'active' as AgentMemoryStatus,
    content: '',
  })
  const [policyDraft, setPolicyDraft] = useState({
    agentId: '',
    mode: 'observe_only' as MemoryPolicyMode,
    maxContextChars: '1200',
    allowChatTeaching: false,
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['memory-status'],
    queryFn: getMemoryStatus,
    refetchInterval: 30000,
  })

  const effectiveAgentId = agentId || agents[0]?.agentId || ''
  const currentAgent = agents.find(agent => agent.agentId === effectiveAgentId)

  const { data: memoriesData, isLoading: memoriesLoading } = useQuery({
    queryKey: ['agent-memories', effectiveAgentId, tab, query, typeFilter, scopeFilter],
    queryFn: () => getAgentMemories({
      agentId: effectiveAgentId || undefined,
      status: tabStatus(tab),
      q: query || undefined,
      type: tabForcedType(tab) || (typeFilter === 'all' ? undefined : typeFilter),
      scope: scopeFilter === 'all' ? undefined : scopeFilter,
      limit: 300,
    }),
    enabled: Boolean(effectiveAgentId && tabUsesMemoryList(tab)),
    retry: false,
  })

  const { data: observationsData, isLoading: observationsLoading } = useQuery({
    queryKey: ['memory-observations', effectiveAgentId, query, typeFilter, tab],
    queryFn: () => getMemoryObservations({
      agentId: effectiveAgentId || undefined,
      q: query || undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
      limit: 300,
    }),
    enabled: Boolean(effectiveAgentId && tab === 'sources'),
    retry: false,
  })

  const { data: policyData } = useQuery({
    queryKey: ['memory-policies'],
    queryFn: getMemoryPolicies,
    retry: false,
  })

  const { data: backupData } = useQuery({
    queryKey: ['memory-backups', effectiveAgentId],
    queryFn: () => getMemoryBackups(effectiveAgentId),
    enabled: Boolean(effectiveAgentId && tab === 'backups'),
    retry: false,
  })

  const selectedPolicy = useMemo(() => {
    return policyData?.policies.find(policy => policy.agentId === effectiveAgentId) || {
      agentId: effectiveAgentId,
      mode: currentAgent?.autoLearn?.autoLearnMode || 'observe_only',
      maxContextChars: currentAgent?.autoLearn?.maxContextChars || 1200,
      safeTypes: ['terminology', 'preference', 'workflow_hint', 'faq_pattern', 'entity_alias'] as MemoryType[],
      allowChatTeaching: false,
      retentionDays: null,
    }
  }, [currentAgent?.autoLearn?.autoLearnMode, currentAgent?.autoLearn?.maxContextChars, effectiveAgentId, policyData?.policies])

  const policyForm = useMemo(() => {
    if (policyDraft.agentId === selectedPolicy.agentId) return policyDraft
    return {
      agentId: selectedPolicy.agentId,
      mode: selectedPolicy.mode,
      maxContextChars: String(selectedPolicy.maxContextChars || 1200),
      allowChatTeaching: Boolean(selectedPolicy.allowChatTeaching),
    }
  }, [policyDraft, selectedPolicy.agentId, selectedPolicy.allowChatTeaching, selectedPolicy.maxContextChars, selectedPolicy.mode])

  function updatePolicyDraft(patch: Partial<typeof policyForm>) {
    setPolicyDraft(prev => ({
      ...(prev.agentId === selectedPolicy.agentId ? prev : policyForm),
      ...patch,
      agentId: selectedPolicy.agentId,
    }))
  }

  function invalidateMemory() {
    queryClient.invalidateQueries({ queryKey: ['memory-status'] })
    queryClient.invalidateQueries({ queryKey: ['agent-memories'] })
    queryClient.invalidateQueries({ queryKey: ['memory-observations'] })
    queryClient.invalidateQueries({ queryKey: ['memory-policies'] })
    queryClient.invalidateQueries({ queryKey: ['memory-backups'] })
  }

  async function openView(title: string, loader: () => Promise<string>) {
    setViewDialog({ title, content: '', loading: true })
    try {
      const content = await loader()
      setViewDialog({ title, content })
    } catch {
      setViewDialog({ title, content: 'โหลดไม่สำเร็จ' })
    }
  }

  const createMutation = useMutation({
    mutationFn: () => createAgentMemory({
      agentId: effectiveAgentId,
      type: memoryForm.type,
      scope: memoryForm.scope,
      status: memoryForm.status,
      content: memoryForm.content.trim(),
      sourceAuthority: 'admin_config',
    }),
    onSuccess: () => {
      toast.success('เพิ่ม memory แล้ว')
      setAddOpen(false)
      setMemoryForm(f => ({ ...f, content: '' }))
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'เพิ่ม memory ไม่สำเร็จ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<AgentMemory, 'status' | 'type' | 'scope' | 'content' | 'confidence' | 'evidence'>> }) => updateAgentMemory(id, body),
    onSuccess: () => {
      toast.success('อัปเดต memory แล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'อัปเดต memory ไม่สำเร็จ'),
  })

  const deleteMutation = useMutation({
    mutationFn: (memory: AgentMemory) => deleteAgentMemory(memory.id, true),
    onSuccess: () => {
      toast.success('ลบ memory และกันไม่ให้เรียนซ้ำแล้ว')
      setDeleteTarget(null)
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'ลบ memory ไม่สำเร็จ'),
  })

  const blockMutation = useMutation({
    mutationFn: (memory: AgentMemory) => blockMemoryRelearn(memory.id, 'Blocked from Memory Control Center'),
    onSuccess: () => {
      toast.success('ย้ายไป Blocked และสร้าง tombstone แล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Block relearn ไม่สำเร็จ'),
  })

  const promoteMutation = useMutation({
    mutationFn: (observation: MemoryObservation) => promoteMemoryObservation(observation.id, {
      status: observation.risk === 'high' ? 'blocked' : 'soft',
      type: observation.type,
      scope: observation.scope,
      content: observation.summary,
      confidence: observation.confidence,
    }),
    onSuccess: (_result, observation) => {
      toast.success(isHighRiskObservation(observation) ? 'บันทึกเป็นเรื่องห้ามจำแล้ว' : 'บันทึกเป็น Soft memory แล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Promote ไม่สำเร็จ'),
  })

  const policyMutation = useMutation({
    mutationFn: () => putMemoryPolicy(effectiveAgentId, {
      mode: policyForm.mode,
      maxContextChars: Number(policyForm.maxContextChars),
      allowChatTeaching: policyForm.allowChatTeaching,
      safeTypes: policyForm.allowChatTeaching ? safeAutoTypes : safeAutoTypes.filter(type => type !== 'staff_instruction'),
    }),
    onSuccess: () => {
      toast.success('บันทึก Auto-Learn policy แล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'บันทึก policy ไม่สำเร็จ'),
  })

  const enableSafeAutoMutation = useMutation({
    mutationFn: () => putMemoryPolicy(effectiveAgentId, {
      mode: 'safe_auto',
      maxContextChars: Number(policyForm.maxContextChars) || 1200,
      allowChatTeaching: true,
      safeTypes: safeAutoTypes,
    }),
    onSuccess: policy => {
      const result = policy.autoApplyResult
      toast.success(result
        ? `Safe Auto เปิดแล้ว: learned ${result.promoted}, blocked ${result.blocked}`
        : 'Safe Auto เปิดแล้ว')
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'เปิด Safe Auto ไม่สำเร็จ'),
  })

  const applyAutoMutation = useMutation({
    mutationFn: () => applyMemoryAutoLearn(effectiveAgentId),
    onSuccess: result => {
      toast.success(`Auto-Learn applied: learned ${result.promoted}, blocked ${result.blocked}, skipped ${result.skipped}`)
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Apply Auto-Learn ไม่สำเร็จ'),
  })

  const cleanupPreviewMutation = useMutation({
    mutationFn: () => cleanupMemory(effectiveAgentId, true),
    onSuccess: result => {
      setCleanupResult(result)
      toast.success(`Preview cleanup: พบ ${result.actions.length} รายการที่ควรจัดการ`)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Preview cleanup ไม่สำเร็จ'),
  })

  const cleanupApplyMutation = useMutation({
    mutationFn: () => cleanupMemory(effectiveAgentId, false),
    onSuccess: result => {
      setCleanupResult(result)
      toast.success(`Cleanup applied: delete ${result.summary.delete + result.summary.deleteDuplicate}, block ${result.summary.block}, soften ${result.summary.soften}`)
      invalidateMemory()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Apply cleanup ไม่สำเร็จ'),
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

  const memories = memoriesData?.memories ?? []
  const observations = observationsData?.observations ?? []
  const summary = currentAgent?.autoLearn || {
    autoLearnMode: 'observe_only',
    activeMemoryCount: 0,
    softMemoryCount: 0,
    blockedCount: 0,
    deletedCount: 0,
    estimatedInjectedChars: 0,
    maxContextChars: 1200,
    memoryHealth: defaultMemoryHealth(),
  }
  const memoryHealth = summary.memoryHealth || defaultMemoryHealth()

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Brain Control Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            หน้านี้ใช้คุมความรู้ที่ agent ใช้จริง, คำช่วยค้น, คำแนะนำเติม SML description และเรื่องที่ห้ามจำ ส่วน Conversation Analysis ใช้ดูหลักฐานจากบทสนทนา
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={effectiveAgentId} onValueChange={value => setAgentId(value || '')}>
            <SelectTrigger className="w-[180px]" aria-label="เลือก agent"><SelectValue placeholder="เลือก agent" /></SelectTrigger>
            <SelectContent>
              {agents.map(agent => <SelectItem key={agent.agentId} value={agent.agentId}>{agent.agentId}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setAddOpen(true)} disabled={!effectiveAgentId}>
            <Plus className="size-4" />
            เพิ่ม Memory
          </Button>
        </div>
      </div>

      <LearningControlPanel
        agentId={effectiveAgentId}
        mode={summary.autoLearnMode}
        activeCount={summary.activeMemoryCount}
        softCount={summary.softMemoryCount}
        blockedCount={summary.blockedCount}
        estimatedChars={summary.estimatedInjectedChars}
        maxChars={summary.maxContextChars}
        memoryHealth={memoryHealth}
        busy={enableSafeAutoMutation.isPending || applyAutoMutation.isPending}
        lastResult={enableSafeAutoMutation.data?.autoApplyResult || applyAutoMutation.data}
        onEnable={() => enableSafeAutoMutation.mutate()}
        onApply={() => applyAutoMutation.mutate()}
        onPreviewCleanup={() => cleanupPreviewMutation.mutate()}
        cleanupBusy={cleanupPreviewMutation.isPending || cleanupApplyMutation.isPending}
      />

      <section className="grid gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">โหมด Auto-Learn</p>
            <p className="mt-2 text-xl font-semibold">{modeLabel(summary.autoLearnMode)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Safe Auto จะจำเฉพาะ low-risk และ block เรื่อง ERP truth</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">ใช้ตอบจริง</p>
            <p className="mt-2 text-xl font-semibold">{summary.activeMemoryCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active memory ที่ runtime สามารถใช้ได้เมื่อ policy เปิด</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">ชั่วคราว</p>
            <p className="mt-2 text-xl font-semibold">{summary.softMemoryCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">ใช้กับ session/contact หรือข้อมูลที่ยังไม่ควรเป็น truth</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">งบ prompt</p>
            <p className="mt-2 text-xl font-semibold">{formatChars(summary.estimatedInjectedChars)}</p>
            <p className="mt-1 text-xs text-muted-foreground">สูงสุดต่อ turn {formatChars(summary.maxContextChars)}</p>
          </CardContent>
        </Card>
      </section>

      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">ค้นหาและจัดการ Agent Brain</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Active Knowledge ใช้ตอบจริง, Search Hints ช่วยค้นแต่ยังต้อง verify ด้วย MCP, Description Suggestions เป็นคำแนะนำให้ staff เติม SML ERP
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_150px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={event => setQuery(event.target.value)} className="pl-8" placeholder="ค้นหา memory หรือ observation..." />
              </div>
              <Select value={typeFilter} onValueChange={value => setTypeFilter(value || 'all')}>
                <SelectTrigger aria-label="กรองประเภท memory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกประเภท</SelectItem>
                  {memoryTypeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={scopeFilter} onValueChange={value => setScopeFilter(value || 'all')}>
                <SelectTrigger aria-label="กรอง scope memory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุก scope</SelectItem>
                  {scopeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={value => setTab(value as MemoryTab)} className="gap-0">
          <div className="border-b px-4 py-3">
            <TabsList className="flex w-full flex-wrap justify-start sm:w-fit">
              <TabsTrigger value="active">ใช้ตอบจริง</TabsTrigger>
              <TabsTrigger value="search_hints">Search Hints</TabsTrigger>
              <TabsTrigger value="description_suggestions">Description</TabsTrigger>
              <TabsTrigger value="soft">พักไว้</TabsTrigger>
              <TabsTrigger value="blocked">ห้ามจำ</TabsTrigger>
              <TabsTrigger value="deleted">ลบแล้ว</TabsTrigger>
              <TabsTrigger value="sources">สัญญาณจากแชท</TabsTrigger>
              <TabsTrigger value="settings">ตั้งค่า Auto-Learn</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="backups">Backups</TabsTrigger>
            </TabsList>
          </div>

          {(['active', 'search_hints', 'description_suggestions', 'soft', 'blocked', 'deleted'] as MemoryTab[]).map(statusTab => (
            <TabsContent key={statusTab} value={statusTab} className="p-4">
              {statusTab === 'search_hints' ? (
                <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Search Hints คือคำช่วยค้นหรือ alias ที่ช่วยให้ agent ตั้ง keyword ดีขึ้น แต่ราคา/สต็อก/สินค้าแทนยังต้องยืนยันด้วย MCP/SML ทุกครั้ง
                </div>
              ) : null}
              {statusTab === 'description_suggestions' ? (
                <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Description Suggestions คือคำแนะนำให้ staff เติมช่อง description ใน SML ERP เพื่อให้ search_product.v2 ค้นง่ายขึ้น ไม่ใช่ข้อมูลที่ bot ใช้ตอบลูกค้าโดยตรง
                </div>
              ) : null}
              {memoriesLoading ? <div className="rounded-lg border p-4 text-sm text-muted-foreground">กำลังโหลด memory...</div> : null}
              {!memoriesLoading && !memories.length ? (
                <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                  ยังไม่มีรายการในหมวดนี้ ใช้ปุ่ม “เพิ่ม Memory” หรือดู Sources เมื่อพร้อมใช้งาน
                </div>
              ) : null}
              <div className="grid gap-3 xl:grid-cols-2">
                {memories.map(memory => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    onDisable={() => updateMutation.mutate({ id: memory.id, body: { status: memory.status === 'active' ? 'soft' : 'active' } })}
                    onBlock={() => blockMutation.mutate(memory)}
                    onDelete={() => setDeleteTarget(memory)}
                    busy={updateMutation.isPending || blockMutation.isPending}
                  />
                ))}
              </div>
            </TabsContent>
          ))}

          <TabsContent value="sources" className="p-4">
            <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Sources คือหลักฐานจาก Conversation Analysis ยังไม่ใช่ truth โดยตรง ระบบจะแยก decision เช่น search hint, description suggestion, blocked fact หรือ manual review ก่อนเสมอ
            </div>
            {observationsLoading ? <div className="rounded-lg border p-4 text-sm text-muted-foreground">กำลังโหลด learning signals...</div> : null}
            {!observationsLoading && !observations.length ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                ยังไม่มี learning signal สำหรับ agent นี้ ลองเปิด conversation detail หรือรัน backfill เพื่อให้ระบบ ingest observation
              </div>
            ) : null}
            <div className="space-y-3">
              {observations.map(observation => (
                <ObservationRow
                  key={observation.id}
                  observation={observation}
                  onPromote={() => promoteMutation.mutate(observation)}
                  busy={promoteMutation.isPending}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="p-4">
            <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4" />
                    Auto-Learn Policy
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    เปลี่ยนโหมดต่อ agent ได้ โหมดใช้งานจริงคือ Safe Auto พร้อม guardrails ราคา/สต็อก/ต้นทุน
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">โหมด</span>
                    <Select value={policyForm.mode} onValueChange={value => updatePolicyDraft({ mode: value as MemoryPolicyMode })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {policyModes.map(mode => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{policyModes.find(mode => mode.value === policyForm.mode)?.help}</p>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">Memory context สูงสุดต่อ turn</span>
                    <Input value={policyForm.maxContextChars} onChange={event => updatePolicyDraft({ maxContextChars: event.target.value })} inputMode="numeric" />
                    <p className="text-xs text-muted-foreground">ใช้คุม token ไม่ให้ memory ยาวเกินจำเป็น</p>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={policyForm.allowChatTeaching}
                      onChange={event => updatePolicyDraft({ allowChatTeaching: event.target.checked })}
                    />
                    <span>
                      <span className="block text-sm font-medium">อนุญาต staff สอนผ่าน chat</span>
                      <span className="block text-xs text-muted-foreground">ควรเปิดเฉพาะ agent หรือ channel ที่รู้ว่า user เป็น staff/admin</span>
                    </span>
                  </label>
                  <Button onClick={() => policyMutation.mutate()} disabled={!effectiveAgentId || policyMutation.isPending}>
                    <ShieldCheck className="size-4" />
                    บันทึก Policy
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">กติกาความปลอดภัย</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>ระบบจะไม่จำราคา สต็อก ต้นทุน สินค้ามี/ไม่มี หรือสินค้าทดแทนจากบทสนทนาเป็นความจริงถาวร</p>
                  <p>ถ้า admin ลบ memory ระบบจะสร้าง tombstone เพื่อกันการเรียนซ้ำทันทีจาก pattern เดิม</p>
                  <p>Search Hints และ Description Suggestions เป็น Agent Brain evidence ไม่ใช่ราคา/สต็อกหรือ master data</p>
                  <p>Business Profile, SOUL และ MCP/Search ยังเป็นชั้นแยก ไม่ถูกแก้อัตโนมัติจาก Auto-Learn v2</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="files" className="p-4">
            <div className="grid gap-3 xl:grid-cols-2">
              {agents.map(agent => (
                <Card key={agent.agentId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-mono">{agent.agentId}</CardTitle>
                    <p className="break-all text-xs text-muted-foreground">{agent.workspace}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <FileRow
                      title="MEMORY.md"
                      subtitle={agent.memory.exists ? `${formatChars(agent.memory.sizeChars)} · ${agent.memory.injectedLikely}` : 'ยังไม่มีไฟล์'}
                      preview={agent.memory.preview}
                      canOpen={agent.memory.exists}
                      onOpen={() => openView(`${agent.agentId} — MEMORY.md`, () => getMemoryContent(agent.agentId))}
                    />
                    <FileRow
                      title={agent.dreams.canonicalName || 'DREAMS.md'}
                      subtitle={agent.dreams.exists ? `${formatChars(agent.dreams.sizeChars)} · review diary` : 'ยังไม่มีไฟล์'}
                      preview={agent.dreams.preview}
                      canOpen={agent.dreams.exists}
                      onOpen={() => openView(`${agent.agentId} — ${agent.dreams.canonicalName || 'DREAMS.md'}`, () => getDreamsContent(agent.agentId))}
                    />
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

          <TabsContent value="backups" className="p-4">
            {!backupData?.backups.length ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                ยังไม่มี backup จากการแก้ memory หรือ rollback สำหรับ agent นี้
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
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[86vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>เพิ่ม Memory</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 space-y-3 overflow-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Status</span>
                <Select value={memoryForm.status} onValueChange={value => setMemoryForm(f => ({ ...f, status: value as AgentMemoryStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="soft">Soft</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Type</span>
                <Select value={memoryForm.type} onValueChange={value => setMemoryForm(f => ({ ...f, type: value as MemoryType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {memoryTypeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Scope</span>
                <Select value={memoryForm.scope} onValueChange={value => setMemoryForm(f => ({ ...f, scope: value as MemoryScope }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">ข้อความที่จะจำ</span>
              <Textarea
                rows={6}
                value={memoryForm.content}
                onChange={event => setMemoryForm(f => ({ ...f, content: event.target.value }))}
                placeholder="เขียนเป็นข้อเท็จจริงสั้น ๆ ที่ปลอดภัย เช่น ลูกค้าร้านนี้มักส่งรูปก่อนแล้วถามต่อด้วยข้อความสั้น"
              />
            </label>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              ห้ามใส่ราคา สต็อก ต้นทุน token หรือข้อมูลลับลง memory เพราะข้อมูลเหล่านี้ต้องมาจาก tool เท่านั้น
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!memoryForm.content.trim() || createMutation.isPending}>
              <Plus className="size-4" />
              เพิ่ม Memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>ลบ memory และกันเรียนซ้ำ</DialogTitle>
          </DialogHeader>
          {deleteTarget ? (
            <div className="space-y-3 text-sm">
              <p>memory นี้จะถูกย้ายไป Deleted และสร้าง tombstone เพื่อกันไม่ให้ระบบเรียนเรื่องเดิมซ้ำทันที</p>
              <div className="max-h-56 overflow-auto rounded-lg border bg-muted p-3 whitespace-pre-wrap">{deleteTarget.content}</div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)} disabled={deleteMutation.isPending}>
              <Trash2 className="size-4" />
              ลบและกันเรียนซ้ำ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rollbackBackup} onOpenChange={open => { if (!open) setRollbackBackup(null) }}>
        <DialogContent className="sm:max-w-xl">
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

      <CleanupDialog
        result={cleanupResult}
        busy={cleanupApplyMutation.isPending}
        onClose={() => setCleanupResult(null)}
        onApply={() => cleanupApplyMutation.mutate()}
      />

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
    </div>
  )
}

function LearningControlPanel({
  agentId,
  mode,
  activeCount,
  softCount,
  blockedCount,
  estimatedChars,
  maxChars,
  memoryHealth,
  busy,
  cleanupBusy,
  lastResult,
  onEnable,
  onApply,
  onPreviewCleanup,
}: {
  agentId: string
  mode?: MemoryPolicyMode | string
  activeCount: number
  softCount: number
  blockedCount: number
  estimatedChars: number
  maxChars: number
  memoryHealth: MemoryHealth
  busy: boolean
  cleanupBusy: boolean
  lastResult?: MemoryAutoApplyResult
  onEnable: () => void
  onApply: () => void
  onPreviewCleanup: () => void
}) {
  const safeAuto = mode === 'safe_auto'
  const off = mode === 'off'
  const qualityIssues = cleanupIssueCount(memoryHealth)
  const needsCleanup = qualityIssues > 0 || memoryHealth.overBudget
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={safeAuto ? 'default' : off ? 'destructive' : 'secondary'}>
              {safeAuto ? 'Safe Auto เปิดอยู่' : off ? 'Auto-Learn ปิดอยู่' : modeLabel(mode)}
            </Badge>
            <Badge variant="outline">agent: {agentId || '-'}</Badge>
            <Badge variant={memoryHealth.overBudget ? 'destructive' : 'outline'}>{formatChars(memoryHealth.injectedChars || estimatedChars)} / {formatChars(maxChars)}</Badge>
          </div>
          <h2 className="mt-3 text-base font-semibold">Auto-Learn ใช้งานจริงแบบปลอดภัย</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            ระบบจะเรียนรู้เฉพาะคำศัพท์, alias, workflow และคำสอนที่ปลอดภัย ส่วนราคา สต็อก ต้นทุน สินค้ามี/ไม่มี และราคาพิเศษจะถูกบันทึกเป็นเรื่องห้ามจำ ต้องดึงสดจาก MCP/SML ทุกครั้ง
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">ใช้ตอบจริง</p>
              <p className="mt-1 text-lg font-semibold">{activeCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">พักไว้</p>
              <p className="mt-1 text-lg font-semibold">{softCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">ห้ามจำ</p>
              <p className="mt-1 text-lg font-semibold">{blockedCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">ซ้ำ</p>
              <p className="mt-1 text-lg font-semibold">{memoryHealth.duplicateCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">noise/dynamic</p>
              <p className="mt-1 text-lg font-semibold">{memoryHealth.noiseCount + memoryHealth.dynamicFactCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">ไม่ได้ inject</p>
              <p className="mt-1 text-lg font-semibold">{memoryHealth.activeButNotInjectedCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">สิ่งที่ควรทำตอนนี้</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {needsCleanup
              ? 'มี memory ที่ควรตรวจ เช่น ซ้ำ, noise, dynamic fact หรือเกิน budget ให้ preview ก่อน cleanup'
              : safeAuto
              ? 'กด apply เพื่อประมวลผล signal ที่รออยู่ แล้วให้ลูกค้าทดลองคุย 1-3 วัน'
              : 'เปิด Safe Auto ก่อน เพื่อให้ระบบเรียนรู้ low-risk โดยไม่ต้อง approve ทีละเรื่อง'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsCleanup ? (
              <Button onClick={onPreviewCleanup} disabled={!agentId || cleanupBusy}>
                <Wrench className="size-4" />
                Preview Cleanup
              </Button>
            ) : safeAuto ? (
              <Button onClick={onApply} disabled={!agentId || busy}>
                <Sparkles className="size-4" />
                Apply Auto-Learn now
              </Button>
            ) : (
              <Button onClick={onEnable} disabled={!agentId || busy}>
                <ShieldCheck className="size-4" />
                เปิด Safe Auto
              </Button>
            )}
            <Button variant="outline" onClick={() => { window.location.href = '/analysis/conversations' }}>
              <Eye className="size-4" />
              ดู Conversation
            </Button>
          </div>
          {needsCleanup ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-3.5" />
                Memory Health ต้องตรวจ
              </div>
              <p className="mt-1">preview จะไม่แก้ข้อมูล จนกว่าจะกด Apply cleanup ใน dialog</p>
            </div>
          ) : null}
          {lastResult ? (
            <div className="mt-3 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <CheckCircle2 className="size-3.5" />
                ผลล่าสุด
              </div>
              <p className="mt-1">scanned {lastResult.scanned} · learned {lastResult.promoted} · blocked {lastResult.blocked} · skipped {lastResult.skipped}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function CleanupDialog({
  result,
  busy,
  onClose,
  onApply,
}: {
  result: MemoryCleanupResult | null
  busy: boolean
  onClose: () => void
  onApply: () => void
}) {
  const actionableCount = result?.actions.length || 0
  const summary = result?.summary
  const exampleGroups = [
    { key: 'dynamic_fact', label: 'Dynamic facts', help: 'ราคา/สต็อก/ต้นทุน/availability ต้องดึงสดจาก MCP' },
    { key: 'noise', label: 'Noise', help: 'log/system marker หรือ media placeholder ที่ไม่ควรเป็น memory' },
    { key: 'duplicate', label: 'Duplicates', help: 'memory ซ้ำจาก content เดียวกัน' },
    { key: 'vague_teaching', label: 'Vague teaching', help: 'คำสอนที่อ้าง “ตัวนี้/รายการนี้” ไม่ชัดพอ' },
  ]
  return (
    <Dialog open={!!result} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="grid max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-4" />
            {result?.dryRun ? 'Preview Memory Cleanup' : 'Memory Cleanup Result'}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-auto pr-1">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={result?.dryRun ? 'secondary' : result?.ok ? 'default' : 'destructive'}>
                {result?.dryRun ? 'dry-run ยังไม่แก้ข้อมูล' : result?.ok ? 'applied' : 'partial error'}
              </Badge>
              <Badge variant="outline">agent: {result?.agentId || '-'}</Badge>
              <Badge variant="outline">actionable: {actionableCount}</Badge>
              {result?.backup ? <Badge variant="outline">backup: {result.backup.fileName}</Badge> : null}
            </div>
            <p className="mt-2 text-muted-foreground">
              Cleanup จะลบ noise/duplicate แบบไม่ทำลายหลักฐาน, block dynamic fact พร้อม tombstone, และ sync MEMORY.md ใหม่หลัง apply
            </p>
          </div>

          {summary ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <MetricTile label="สแกน" value={summary.scanned} />
              <MetricTile label="ลบ/ซ้ำ" value={summary.delete + summary.deleteDuplicate} />
              <MetricTile label="block" value={summary.block} />
              <MetricTile label="soften" value={summary.soften} />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {exampleGroups.map(group => {
              const examples = result?.examples?.[group.key] || []
              return (
                <div key={group.key} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{group.label}</p>
                      <p className="text-xs text-muted-foreground">{group.help}</p>
                    </div>
                    <Badge variant={examples.length ? 'secondary' : 'outline'}>{examples.length}</Badge>
                  </div>
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                    {examples.length ? examples.map(example => (
                      <div key={example.memoryId} className="rounded-md bg-muted/40 p-2 text-xs">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{example.action}</Badge>
                          <span className="text-muted-foreground">{example.reason}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words">{example.contentPreview}</p>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">ไม่พบตัวอย่างกลุ่มนี้</p>}
                  </div>
                </div>
              )
            })}
          </div>

          {result?.actions.length ? (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Action preview ({result.actions.length})</summary>
              <pre className="max-h-72 overflow-auto border-t p-3 text-xs">{JSON.stringify(result.actions, null, 2)}</pre>
            </details>
          ) : null}

          {!result?.dryRun && result?.errors?.length ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-medium">มีบางรายการ cleanup ไม่สำเร็จ</p>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result.errors, null, 2)}</pre>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ปิด</Button>
          {result?.dryRun && actionableCount > 0 ? (
            <Button onClick={onApply} disabled={busy}>
              <Wrench className="size-4" />
              Apply cleanup พร้อม backup
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function MemoryCard({
  memory,
  onDisable,
  onBlock,
  onDelete,
  busy,
}: {
  memory: AgentMemory
  onDisable: () => void
  onBlock: () => void
  onDelete: () => void
  busy: boolean
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(memory.status)}>{memory.status}</Badge>
            <Badge variant="outline">{typeLabel(memory.type)}</Badge>
            <Badge variant="secondary">{scopeLabel(memory.scope)}</Badge>
            {memory.confidence !== null ? <Badge variant="outline">{Math.round(memory.confidence * 100)}%</Badge> : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{memory.content}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>source: {memory.sourceAuthority}</span>
            <span>used: {memory.usageCount}</span>
            <span>updated: {formatDateTime(memory.updatedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {memory.status !== 'deleted' ? (
            <Button variant="outline" size="sm" onClick={onDisable} disabled={busy}>
              <Clock3 className="size-4" />
              {memory.status === 'active' ? 'ทำเป็น Soft' : 'Activate'}
            </Button>
          ) : null}
          {memory.status !== 'blocked' && memory.status !== 'deleted' ? (
            <Button variant="outline" size="sm" onClick={onBlock} disabled={busy}>
              <Ban className="size-4" />
              Block
            </Button>
          ) : null}
          {memory.status !== 'deleted' ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" />
              ลบ
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ObservationRow({ observation, onPromote, busy }: { observation: MemoryObservation; onPromote: () => void; busy: boolean }) {
  const highRisk = isHighRiskObservation(observation)
  const canPromote = observation.safeToPromote === true || highRisk
  const actionDisabled = busy || !canPromote || observation.status === 'promoted' || observation.status === 'blocked'
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(observation.status)}>{observation.status}</Badge>
            <Badge variant={observation.risk === 'high' ? 'destructive' : 'outline'}>risk: {observation.risk}</Badge>
            <Badge variant="outline">{typeLabel(observation.type)}</Badge>
            <Badge variant="secondary">{observation.recommendedAction}</Badge>
            {observation.decision ? <Badge variant={observation.safeToPromote ? 'default' : 'outline'}>{observation.decision}</Badge> : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm font-medium">{observation.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            turn: {observation.sourceTurnId || '-'} · updated {formatDateTime(observation.updatedAt)}
          </p>
          {highRisk ? (
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              ข้อมูลราคา สต็อก ต้นทุน หรือสถานะจาก ERP ต้องดึงสดจาก MCP/SML ทุกครั้ง จึงบันทึกได้เฉพาะเป็นเรื่องที่ห้ามจำ
            </p>
          ) : null}
          {observation.decisionReason ? (
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              decision: {observation.decisionReason}
            </p>
          ) : null}
        </div>
        <Button variant={highRisk ? 'destructive' : 'outline'} size="sm" onClick={onPromote} disabled={actionDisabled}>
          {highRisk ? <Ban className="size-4" /> : <Database className="size-4" />}
          {highRisk ? 'ห้ามจำเรื่องนี้' : canPromote ? 'บันทึกเป็น Soft memory' : 'ใช้เป็นหลักฐานเท่านั้น'}
        </Button>
      </div>
      {Object.keys(observation.evidence || {}).length ? (
        <details className="mt-3 rounded-md border bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Evidence</summary>
          <pre className="max-h-56 overflow-auto border-t p-3 text-xs">{JSON.stringify(observation.evidence, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  )
}

function FileRow({
  title,
  subtitle,
  preview,
  canOpen,
  onOpen,
}: {
  title: string
  subtitle: string
  preview?: string
  canOpen?: boolean
  onOpen: () => void
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {canOpen ? (
          <Button variant="outline" size="sm" onClick={onOpen}>อ่าน</Button>
        ) : null}
      </div>
      {preview ? (
        <pre className="mt-2 max-h-28 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs leading-relaxed">
          {shortText(preview, 420)}
        </pre>
      ) : null}
    </div>
  )
}
