'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getConfig,
  getModelCatalog,
  getModelReadiness,
  putConfig,
  putModelSettings,
  restartGateway,
  testModelImageMessage,
  testModelMessage,
  testProvider,
  PROVIDERS,
  type ModelCatalog,
  type ModelImageUploadPayload,
  type ModelMessageTestResult,
  type ModelRuntimeTestResult,
  type ModelSettingsResult,
  type ModelSettingsPayload,
  type OpenRouterModel,
  type ProviderConfig,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Image as ImageIcon,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'

const OPENROUTER_RECOMMENDED = {
  primary: 'openrouter/google/gemini-2.5-flash-lite',
  fallbacks: [
    'openrouter/qwen/qwen3.5-flash-02-23',
    'openrouter/openai/gpt-4o-mini',
  ],
  imagePrimary: 'openrouter/google/gemini-2.5-flash-lite',
}

const KILO_RECOMMENDED = {
  primary: 'kilocode/openai/gpt-4o-mini',
  fallbacks: [
    'kilocode/google/gemini-3.1-flash-lite',
    'kilocode/qwen/qwen3-vl-235b-a22b-instruct',
  ],
}

type KeyTestState = 'idle' | 'ok' | 'fail'
type ImageUploadDraft = ModelImageUploadPayload & {
  previewUrl: string
  size: number
}

const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024
const SUPPORTED_IMAGE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function providerFromRef(ref: string): ProviderConfig {
  const providerId = ref.includes('/') ? ref.split('/')[0] : 'openrouter'
  return PROVIDERS.find(provider => provider.id === providerId) || PROVIDERS[0]
}

function modelIdFromRef(ref: string, provider: ProviderConfig): string {
  const prefix = `${provider.modelPrefix}/`
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ''
}

function fullRef(provider: ProviderConfig, modelId: string) {
  return modelId ? `${provider.modelPrefix}/${modelId}` : ''
}

function compactModel(ref: string) {
  return ref.replace(/^openrouter\//, '').replace(/^kilocode\//, 'kilo/')
}

function statusLabel(status?: string) {
  if (status === 'ready') return 'พร้อม'
  if (status === 'not_configured') return 'ยังไม่ตั้งค่า'
  if (status === 'missing_key') return 'ไม่มี key'
  if (status === 'auth_error') return 'key ใช้ไม่ได้'
  if (status === 'provider_error') return 'provider error'
  if (status === 'invalid_output') return 'ตอบผิดรูปแบบ'
  if (status === 'timeout') return 'timeout'
  if (status === 'model_not_found') return 'runtime ใช้ไม่ได้'
  if (status === 'not_image_capable') return 'ไม่รองรับรูปภาพ'
  if (status === 'runtime_verified' || status === 'ok') return 'ทดสอบผ่าน'
  if (status === 'runtime_unverified') return 'ยังไม่ทดสอบ'
  if (status === 'runtime_unavailable') return 'runtime ไม่พร้อม'
  return status || 'ไม่ทราบสถานะ'
}

function badgeVariant(status?: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'ready' || status === 'ok' || status === 'runtime_verified') return 'default'
  if (!status || status === 'not_configured' || status === 'runtime_unverified') return 'secondary'
  return 'destructive'
}

function inputModalities(model?: OpenRouterModel): string[] {
  const caps = model?.capabilities as Record<string, unknown> | undefined
  const raw = caps?.inputModalities || caps?.input_modalities || (model as Record<string, unknown> | undefined)?.inputModalities || (model as Record<string, unknown> | undefined)?.input
  return Array.isArray(raw) ? raw.map(item => String(item).toLowerCase()) : []
}

function isImageCapable(model?: OpenRouterModel) {
  return inputModalities(model).includes('image')
}

function formatPrice(model?: OpenRouterModel) {
  const prompt = Number.parseFloat(String(model?.pricing?.prompt || '0'))
  const completion = Number.parseFloat(String(model?.pricing?.completion || '0'))
  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return ''
  const input = prompt > 0 ? `$${(prompt * 1_000_000).toFixed(2)}` : 'free'
  const output = completion > 0 ? `$${(completion * 1_000_000).toFixed(2)}` : 'free'
  return `${input}/${output} per 1M`
}

function runtimeKey(ref: string, capability: 'text' | 'image') {
  return `${capability}:${ref}`
}

function isRuntimeVerified(status?: string) {
  return status === 'runtime_verified' || status === 'ok'
}

function settingsHash(payload: ModelSettingsPayload) {
  return JSON.stringify(payload)
}

function imageModelHash(primary: string, fallbacks: string[], timeoutMs: number) {
  return JSON.stringify({ primary, fallbacks, timeoutMs })
}

function readImageUpload(file: File): Promise<ImageUploadDraft> {
  return new Promise((resolve, reject) => {
    if (!SUPPORTED_IMAGE_UPLOAD_TYPES.includes(file.type)) {
      reject(new Error('unsupported_type'))
      return
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      reject(new Error('too_large'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const base64 = dataUrl.split(',')[1] || ''
      resolve({
        dataUrl,
        base64,
        mimeType: file.type,
        fileName: file.name,
        previewUrl: dataUrl,
        size: file.size,
      })
    }
    reader.onerror = () => reject(new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

function modelCatalogSummary(catalog?: ModelCatalog) {
  if (!catalog) return 'กดเลือก provider เพื่อโหลดรายชื่อ model'
  if (catalog.status === 'ready') return `${catalog.models.length} models พร้อมให้เลือก`
  return catalog.summary || statusLabel(catalog.status)
}

function ModelPicker({
  label,
  value,
  onChange,
  imageOnly = false,
  disabled = false,
  recommendedRefs = [],
  textTestResults,
  runtimeStateForRef,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  imageOnly?: boolean
  disabled?: boolean
  recommendedRefs?: string[]
  textTestResults?: Record<string, ModelMessageTestResult>
  runtimeStateForRef?: (ref: string) => string
}) {
  const initialProvider = providerFromRef(value)
  const [fallbackProvider, setFallbackProvider] = useState<ProviderConfig>(initialProvider)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const qc = useQueryClient()
  const provider = value ? providerFromRef(value) : fallbackProvider
  const modelId = modelIdFromRef(value, provider)

  const { data: catalog, isFetching } = useQuery({
    queryKey: ['models-catalog', provider.id],
    queryFn: () => getModelCatalog(provider.id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const selected = catalog?.models?.find(model => model.id === modelId)
  const selectedTest = value ? textTestResults?.[value] : undefined
  const selectedRuntimeState = value && runtimeStateForRef ? runtimeStateForRef(value) : undefined
  const visibleModels = useMemo(() => {
    const models = catalog?.models || []
    return imageOnly ? models.filter(isImageCapable) : models
  }, [catalog, imageOnly])
  const filteredModels = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return visibleModels
    return visibleModels.filter(model => (
      model.id.toLowerCase().includes(needle) ||
      (model.name || '').toLowerCase().includes(needle) ||
      fullRef(provider, model.id).toLowerCase().includes(needle)
    ))
  }, [provider, query, visibleModels])
  const displayedModels = filteredModels.slice(0, 80)

  async function refreshCatalog() {
    try {
      const next = await getModelCatalog(provider.id, true)
      qc.setQueryData(['models-catalog', provider.id], next)
      if (next.status === 'ready') toast.success(`โหลด model จาก ${provider.label} แล้ว`)
      else toast.warning(statusLabel(next.status))
    } catch {
      toast.error('โหลดรายชื่อ model ไม่สำเร็จ')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {imageOnly && <p className="text-xs text-muted-foreground">แสดงเฉพาะ model ที่ provider ระบุว่ารับรูปภาพได้</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={provider.id}
            onValueChange={providerId => {
              const nextProvider = PROVIDERS.find(item => item.id === providerId) || PROVIDERS[0]
              setFallbackProvider(nextProvider)
              onChange('')
            }}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[170px]">
              <span className="truncate text-left">{provider.label}</span>
            </SelectTrigger>
            <SelectContent align="end">
              {PROVIDERS.map(item => (
                <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={refreshCatalog} disabled={disabled || isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            โหลดใหม่
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{statusLabel(catalog?.status)}</span>
        <span className="ml-2">{modelCatalogSummary(catalog)}</span>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          role="combobox"
          aria-expanded={open}
          disabled={disabled || catalog?.status !== 'ready'}
          onClick={() => setOpen(value => !value)}
          className="inline-flex min-h-11 w-full items-center justify-between rounded-md border bg-background px-3 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="truncate text-left">
            {value ? (selected?.name || compactModel(value)) : 'เลือก model...'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="ค้นหา model..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>ไม่พบ model ที่เลือกได้</CommandEmpty>
              {displayedModels.map(model => {
                const ref = fullRef(provider, model.id)
                const active = ref === value
                return (
                  <CommandItem
                    key={model.id}
                    value={`${model.id} ${model.name}`}
                    onSelect={() => {
                      onChange(ref)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Check className={`size-4 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate">{model.name || model.id}</p>
                          {recommendedRefs.includes(ref) && <Badge variant="secondary" className="h-5 text-[10px]">แนะนำ</Badge>}
                          {textTestResults?.[ref]?.ok && <Badge className="h-5 text-[10px]">ทดสอบผ่าน</Badge>}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">{ref}</p>
                      </div>
                    </div>
                    {formatPrice(model) && <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">{formatPrice(model)}</span>}
                  </CommandItem>
                )
              })}
              {filteredModels.length > displayedModels.length && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  แสดง 80 รายการแรกจาก {filteredModels.length} รายการ พิมพ์คำค้นเพิ่มเพื่อกรอง
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <div className="rounded-md border px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {recommendedRefs.includes(value) && <Badge variant="secondary">แนะนำ</Badge>}
            {selectedTest ? (
              <Badge variant={selectedTest.ok ? 'default' : 'destructive'}>
                {selectedTest.ok ? 'ทดสอบผ่าน' : statusLabel(selectedTest.status)}
              </Badge>
            ) : selectedRuntimeState ? (
              <Badge variant={isRuntimeVerified(selectedRuntimeState) ? 'default' : 'secondary'}>
                {isRuntimeVerified(selectedRuntimeState) ? 'เคยทดสอบผ่าน' : statusLabel(selectedRuntimeState)}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 break-all font-mono">{value}</p>
          {selected && formatPrice(selected) && <p className="mt-1 text-muted-foreground">{formatPrice(selected)}</p>}
        </div>
      )}
    </div>
  )
}

function ProviderKeyCard({
  provider,
  active,
  hasKey,
  testState,
  onClick,
}: {
  provider: ProviderConfig
  active: boolean
  hasKey: boolean
  testState: KeyTestState
  onClick: () => void
}) {
  const status = provider.noApiKey ? 'ไม่ต้องใช้ key' : hasKey ? 'มี key' : 'ไม่มี key'
  const stateLabel = testState === 'ok' ? 'ทดสอบผ่าน' : testState === 'fail' ? 'ทดสอบไม่ผ่าน' : status
  const stateVariant = testState === 'ok'
    ? 'default'
    : testState === 'fail'
      ? 'destructive'
      : hasKey || provider.noApiKey
        ? 'secondary'
        : 'destructive'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-2 text-left transition ${
        active ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium leading-tight">{provider.label}</p>
        <Badge variant={stateVariant} className="shrink-0 text-[10px] sm:text-xs">{stateLabel}</Badge>
      </div>
      <p className="mt-1 hidden truncate font-mono text-xs text-muted-foreground sm:block">{provider.envKey}</p>
    </button>
  )
}

function TextModelTestPanel({
  model,
  result,
  testing,
  elapsedText,
  onTest,
  onCancel,
}: {
  model: string
  result?: ModelMessageTestResult
  testing: boolean
  elapsedText: string
  onTest: () => void
  onCancel: () => void
}) {
  const passed = Boolean(result?.ok)

  return (
    <div className={`space-y-3 rounded-md border px-3 py-3 ${passed ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-950 dark:bg-emerald-950/20' : 'bg-muted/20'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={passed ? 'default' : result ? 'destructive' : 'secondary'}>
              {passed ? 'ทดสอบผ่าน' : result ? statusLabel(result.status) : 'ยังไม่ทดสอบ'}
            </Badge>
            {result?.durationMs ? <span className="text-xs text-muted-foreground">{result.durationMs}ms</span> : null}
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">{model}</p>
          {result?.safeMessage && (
            <p className={`text-sm ${passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
              {result.safeMessage}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {testing ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              <XCircle className="size-4" />
              ยกเลิก
            </Button>
          ) : null}
          <Button type="button" variant={passed ? 'outline' : 'default'} onClick={onTest} disabled={testing}>
            <PlayCircle className="size-4" />
            {testing ? `กำลังทดสอบ ${elapsedText}` : passed ? 'ทดสอบอีกครั้ง' : 'ทดสอบ model นี้'}
          </Button>
        </div>
      </div>
      {testing && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-950 dark:bg-sky-950/25 dark:text-sky-100">
          กำลังเรียก OpenClaw runtime จริง โปรดรอผลทดสอบ
        </div>
      )}
      {result?.outputPreview && (
        <div className="rounded-md border bg-background/70 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">ตัวอย่างคำตอบ</p>
          <p className="mt-1 break-words">{result.outputPreview}</p>
        </div>
      )}
    </div>
  )
}

function TechnicalDetails({
  readiness,
  runtimeResults,
}: {
  readiness: Awaited<ReturnType<typeof getModelReadiness>> | undefined
  runtimeResults: Record<string, ModelRuntimeTestResult>
}) {
  const providerEntries = Object.entries(readiness?.providers || {})
  const runtimeEntries = Object.entries(runtimeResults)

  return (
    <details className="group rounded-md border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-medium">รายละเอียดสำหรับทีมเทคนิค</p>
          <p className="mt-1 text-xs text-muted-foreground">สถานะ provider, readiness และผล runtime test ล่าสุด</p>
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t p-4">
        {readiness?.blockingIssues.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">Blocking issues</p>
            {readiness.blockingIssues.slice(0, 8).map(issue => (
              <div key={`${issue.scope}-${issue.ref}-${issue.status}`} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{statusLabel(issue.status)}</Badge>
                  <span className="break-all font-mono text-xs">{issue.scope}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{issue.summary}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Provider status</p>
            {providerEntries.length === 0 ? (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">ยังไม่มีข้อมูล provider</div>
            ) : providerEntries.map(([provider, status]) => (
              <div key={provider} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{provider}</p>
                  <p className="truncate text-xs text-muted-foreground">{status.modelCount} models · {status.source}</p>
                </div>
                <Badge variant={badgeVariant(status.status)}>{statusLabel(status.status)}</Badge>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Runtime test cache on this page</p>
            {runtimeEntries.length === 0 ? (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">ยังไม่มีการทดสอบในหน้านี้</div>
            ) : runtimeEntries.map(([key, result]) => (
              <div key={key} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={result.ok ? 'default' : 'destructive'}>{result.ok ? 'ผ่าน' : statusLabel(result.status)}</Badge>
                  <span className="break-all font-mono text-xs">{result.model}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{result.safeMessage || result.summary}</p>
                {result.outputPreview && <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{result.outputPreview}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  )
}

export default function ModelPage() {
  const qc = useQueryClient()
  const [providerForKey, setProviderForKey] = useState<ProviderConfig>(PROVIDERS[0])
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyTestStates, setKeyTestStates] = useState<Record<string, KeyTestState>>({})
  const [primary, setPrimary] = useState('')
  const [fallbackDraft, setFallbackDraft] = useState('')
  const [fallbacks, setFallbacks] = useState<string[]>([])
  const [imagePrimary, setImagePrimary] = useState('')
  const [imageFallbacks, setImageFallbacks] = useState<string[]>([])
  const [imageTimeoutMs, setImageTimeoutMs] = useState(30000)
  const [imagePrompt, setImagePrompt] = useState('อธิบายสิ่งที่เห็นในรูปนี้สั้น ๆ')
  const [imageUpload, setImageUpload] = useState<ImageUploadDraft | null>(null)
  const [imageTestResult, setImageTestResult] = useState<ModelRuntimeTestResult | null>(null)
  const [imageTesting, setImageTesting] = useState(false)
  const [imageTestStartedAt, setImageTestStartedAt] = useState<number | null>(null)
  const [testPrompt, setTestPrompt] = useState('สวัสดีครับ')
  const [textTestResults, setTextTestResults] = useState<Record<string, ModelMessageTestResult>>({})
  const [textTestingModel, setTextTestingModel] = useState('')
  const [messageTestStartedAt, setMessageTestStartedAt] = useState<number | null>(null)
  const [lastImageTestHash, setLastImageTestHash] = useState('')
  const [savedHash, setSavedHash] = useState('')
  const [showRestartHint, setShowRestartHint] = useState(false)
  const [runtimeResults, setRuntimeResults] = useState<Record<string, ModelRuntimeTestResult>>({})
  const [progressNowMs, setProgressNowMs] = useState(Date.now())
  const [deleteKeyDialogOpen, setDeleteKeyDialogOpen] = useState(false)
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)
  const [overrideSaveDialogOpen, setOverrideSaveDialogOpen] = useState(false)
  const messageAbortRef = useRef<AbortController | null>(null)
  const imageAbortRef = useRef<AbortController | null>(null)

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: readiness, isFetching: readinessFetching } = useQuery({
    queryKey: ['model-readiness'],
    queryFn: () => getModelReadiness(),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!config) return
    const defaults = config.agents?.defaults || {}
    const nextPrimary = defaults.model?.primary || ''
    const nextFallbacks = defaults.model?.fallbacks || []
    const nextImagePrimary = defaults.imageModel?.primary || ''
    const nextImageFallbacks = defaults.imageModel?.fallbacks || []
    const nextImageTimeout = defaults.imageModel?.timeoutMs || 30000
    const nextPayload: ModelSettingsPayload = {
      defaults: {
        model: { primary: nextPrimary, fallbacks: nextFallbacks },
        imageModel: nextImagePrimary
          ? { primary: nextImagePrimary, fallbacks: nextImageFallbacks, timeoutMs: nextImageTimeout }
          : null,
      },
    }

    setPrimary(nextPrimary)
    setFallbacks(nextFallbacks)
    setImagePrimary(nextImagePrimary)
    setImageFallbacks(nextImageFallbacks)
    setImageTimeoutMs(nextImageTimeout)
    setSavedHash(settingsHash(nextPayload))
    setShowRestartHint(false)
  }, [config])

  useEffect(() => {
    if (!config) return
    setApiKey('')
  }, [config, providerForKey])

  const currentImageHash = imageModelHash(imagePrimary, imageFallbacks, imageTimeoutMs)
  const imageReady = !imagePrimary || isRuntimeVerified(runtimeState(imagePrimary, 'image')) || lastImageTestHash === currentImageHash
  const shouldSaveImageModel = Boolean(imagePrimary && imageReady)
  const payload = useMemo<ModelSettingsPayload>(() => ({
    defaults: {
      model: { primary, fallbacks },
      imageModel: shouldSaveImageModel
        ? { primary: imagePrimary, fallbacks: imageFallbacks, timeoutMs: imageTimeoutMs }
        : null,
    },
  }), [fallbacks, imageFallbacks, imagePrimary, imageTimeoutMs, primary, shouldSaveImageModel])

  const currentHash = settingsHash(payload)
  const hasDraftChanges = Boolean(savedHash && currentHash !== savedHash)
  const currentKey = config?.env?.[providerForKey.envKey] || ''
  const keyChanged = !providerForKey.noApiKey && Boolean(apiKey.trim()) && apiKey.trim() !== currentKey
  const selectedTextModels = [primary, ...fallbacks].filter(Boolean)
  const missingTextProvider = selectedTextModels
    .map(model => providerFromRef(model))
    .find(provider => !provider.noApiKey && !config?.env?.[provider.envKey])
  const textModelReady = (model: string) => Boolean(textTestResults[model]?.ok) || isRuntimeVerified(runtimeState(model, 'text'))
  const unverifiedTextModels = selectedTextModels.filter(model => !textModelReady(model))
  const textModelsReady = Boolean(primary) && unverifiedTextModels.length === 0
  const messageTesting = Boolean(textTestingModel)

  function runtimeState(ref: string, capability: 'text' | 'image') {
    const local = runtimeResults[runtimeKey(ref, capability)]
    if (local) return local.ok ? 'runtime_verified' : local.status
    const chain = capability === 'image' ? readiness?.defaults.imageModel : readiness?.defaults.model
    const refs = [chain?.primary, ...(chain?.fallbacks || [])].filter(Boolean)
    const found = refs.find(item => item?.ref === ref)
    return found?.runtimeStatus || 'runtime_unverified'
  }

  const imageDraftExcluded = Boolean(imagePrimary && !imageReady)
  const canSave = Boolean(primary)
    && !missingTextProvider
    && textModelsReady
    && !keyChanged
    && hasDraftChanges
    && !messageTesting
    && !imageTesting
  const canOverrideSave = Boolean(primary)
    && !missingTextProvider
    && !keyChanged
    && hasDraftChanges
    && !messageTesting
    && !imageTesting
    && !canSave
  const saveReason = !primary
    ? 'เลือก Model หลักก่อน'
    : missingTextProvider
      ? `ตั้งค่า ${missingTextProvider.label} key ก่อน`
      : keyChanged
        ? 'บันทึก key ที่แก้ไขไว้ก่อน'
        : !textModelsReady
          ? `เลือกไว้ได้ แต่ยังไม่ผ่านการทดสอบ (${unverifiedTextModels.length} ตัว)`
          : !hasDraftChanges
            ? 'ยังไม่มีการเปลี่ยนแปลง'
            : ''

  useEffect(() => {
    if (!hasDraftChanges && !keyChanged && !messageTesting && !imageTesting) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasDraftChanges, imageTesting, keyChanged, messageTesting])

  useEffect(() => {
    if (!messageTesting && !imageTesting) return
    setProgressNowMs(Date.now())
    const timer = window.setInterval(() => setProgressNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [imageTesting, messageTesting])

  const saveKeyMutation = useMutation({
    mutationFn: async () => {
      if (!config || providerForKey.noApiKey) return
      await putConfig({
        ...config,
        env: { ...config.env, [providerForKey.envKey]: apiKey.trim() },
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['config'] })
      await qc.invalidateQueries({ queryKey: ['model-readiness'] })
      await qc.invalidateQueries({ queryKey: ['models-catalog'] })
      resetTextTest()
      resetImageTest()
      toast.success('บันทึก provider key แล้ว')
    },
    onError: () => toast.error('บันทึก provider key ไม่สำเร็จ'),
  })

  const deleteKeyMutation = useMutation({
    mutationFn: async () => {
      if (!config || providerForKey.noApiKey) return
      const nextEnv = { ...(config.env || {}) }
      delete nextEnv[providerForKey.envKey]
      await putConfig({ ...config, env: nextEnv })
    },
    onSuccess: async () => {
      setDeleteKeyDialogOpen(false)
      setApiKey('')
      setKeyTestStates(prev => ({ ...prev, [providerForKey.id]: 'idle' }))
      resetTextTest()
      resetImageTest()
      await qc.invalidateQueries({ queryKey: ['config'] })
      await qc.invalidateQueries({ queryKey: ['model-readiness'] })
      await qc.invalidateQueries({ queryKey: ['models-catalog'] })
      toast.success(`ลบ ${providerForKey.label} key แล้ว`)
    },
    onError: () => toast.error('ลบ provider key ไม่สำเร็จ'),
  })

  const testKeyMutation = useMutation({
    mutationFn: () => testProvider(providerForKey.id, apiKey.trim() || currentKey),
    onSuccess: ok => {
      setKeyTestStates(prev => ({ ...prev, [providerForKey.id]: ok ? 'ok' : 'fail' }))
      if (ok) toast.success('Provider key ใช้งานได้')
      else toast.error('Provider key ใช้งานไม่ได้')
    },
    onError: () => {
      setKeyTestStates(prev => ({ ...prev, [providerForKey.id]: 'fail' }))
      toast.error('ทดสอบ provider key ไม่สำเร็จ')
    },
  })

  const saveSettingsMutation = useMutation<ModelSettingsResult, unknown, boolean | undefined>({
    mutationFn: (allowRuntimeOverride) => putModelSettings(payload, false, Boolean(allowRuntimeOverride)),
    onSuccess: async data => {
      qc.setQueryData(['model-readiness'], data.readiness)
      await qc.invalidateQueries({ queryKey: ['config'] })
      setSavedHash(currentHash)
      setShowRestartHint(true)
      setOverrideSaveDialogOpen(false)
      toast.success(`${data.runtimeOverride ? 'บันทึกแบบยอมรับความเสี่ยงแล้ว' : 'บันทึก model settings แล้ว'}${data.write?.backupId ? ` · backup ${data.write.backupId}` : ''}`)
    },
    onError: (error: unknown) => {
      const data = (error as { response?: { data?: { error?: string; blockingIssues?: Array<{ summary?: string; ref?: string }> } } })?.response?.data
      const firstIssue = data?.blockingIssues?.[0]
      const message = firstIssue
        ? `${data?.error || 'Save ไม่สำเร็จ'}: ${firstIssue.ref ? `${firstIssue.ref} ` : ''}${firstIssue.summary || ''}`
        : data?.error || 'Save ไม่สำเร็จ'
      toast.error(message)
    },
  })

  const restartMutation = useMutation({
    mutationFn: restartGateway,
    onSuccess: () => {
      setRestartDialogOpen(false)
      toast.success('Restart Gateway สำเร็จ')
    },
    onError: () => toast.error('Restart Gateway ไม่สำเร็จ'),
  })

  async function refreshReadiness() {
    try {
      const next = await getModelReadiness(true)
      qc.setQueryData(['model-readiness'], next)
      toast.success('Refresh สถานะแล้ว')
    } catch {
      toast.error('Refresh สถานะไม่สำเร็จ')
    }
  }

  function resetTextTest() {
    setTextTestResults({})
  }

  function resetImageTest() {
    setLastImageTestHash('')
    setImageTestResult(null)
  }

  function applyOpenRouterRecommended() {
    setPrimary(OPENROUTER_RECOMMENDED.primary)
    setFallbacks(OPENROUTER_RECOMMENDED.fallbacks)
    resetTextTest()
    toast.info('ใส่ชุด OpenRouter ที่แนะนำแล้ว กดทดสอบก่อนบันทึก')
  }

  function applyKiloRecommended() {
    setPrimary(KILO_RECOMMENDED.primary)
    setFallbacks(KILO_RECOMMENDED.fallbacks)
    resetTextTest()
    toast.info('ใส่ชุด Kilo AI แนะนำแล้ว กดทดสอบแต่ละ model ก่อนบันทึก')
  }

  function addFallback() {
    if (!fallbackDraft) return
    if (fallbackDraft === primary || fallbacks.includes(fallbackDraft)) {
      toast.warning('Model นี้อยู่ในชุดแล้ว')
      return
    }
    setFallbacks(items => [...items, fallbackDraft])
    setFallbackDraft('')
  }

  function removeFallback(index: number) {
    setFallbacks(items => items.filter((_, i) => i !== index))
  }

  function moveFallback(index: number, direction: -1 | 1) {
    setFallbacks(items => {
      const next = [...items]
      const target = index + direction
      if (target < 0 || target >= next.length) return next
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function clearImageModel() {
    setImagePrimary('')
    setImageFallbacks([])
    resetImageTest()
  }

  async function handleImageFileChange(file: File | null) {
    if (!file) {
      setImageUpload(null)
      resetImageTest()
      return
    }
    try {
      const upload = await readImageUpload(file)
      setImageUpload(upload)
      resetImageTest()
    } catch (error) {
      const err = error as { message?: string }
      if (err.message === 'too_large') {
        toast.error(`รูปภาพต้องมีขนาดไม่เกิน ${Math.round(MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024)}MB`)
      } else if (err.message === 'unsupported_type') {
        toast.error('รองรับเฉพาะ PNG, JPG, WEBP หรือ GIF')
      } else {
        toast.error('อ่านไฟล์รูปภาพไม่สำเร็จ')
      }
      setImageUpload(null)
      resetImageTest()
    }
  }

  async function runTextModelTest(model: string) {
    if (!testPrompt.trim()) {
      toast.warning('พิมพ์ข้อความทดสอบก่อน')
      return
    }
    if (keyChanged) {
      toast.warning('บันทึก provider key ที่แก้ไขไว้ก่อนทดสอบ model')
      return
    }
    const provider = providerFromRef(model)
    if (!provider.noApiKey && !config?.env?.[provider.envKey]) {
      toast.warning(`ตั้งค่า ${provider.label} key ก่อน`)
      return
    }

    messageAbortRef.current?.abort()
    const controller = new AbortController()
    messageAbortRef.current = controller
    setTextTestingModel(model)
    setMessageTestStartedAt(Date.now())

    try {
      const result = await testModelMessage({
        primary: model,
        fallbacks: [],
        prompt: testPrompt.trim(),
        capability: 'text',
      }, controller.signal)
      setTextTestResults(prev => ({ ...prev, [model]: result }))
      if (result.ok) {
        await qc.invalidateQueries({ queryKey: ['model-readiness'] })
        toast.success(`${compactModel(model)} ทดสอบผ่าน`)
      } else {
        toast.error(result.safeMessage || 'ทดสอบส่งข้อความไม่ผ่าน')
      }
    } catch (error) {
      const err = error as { code?: string; name?: string; message?: string }
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
        toast.info('ยกเลิกการทดสอบแล้ว')
      } else {
        toast.error('ทดสอบส่งข้อความไม่สำเร็จ')
      }
    } finally {
      setTextTestingModel('')
      messageAbortRef.current = null
    }
  }

  async function runImageTest() {
    if (!imagePrimary) {
      toast.warning('เลือก Model รูปภาพก่อน')
      return
    }
    if (!imageUpload) {
      toast.warning('อัปโหลดรูปภาพก่อนทดสอบ')
      return
    }
    if (!imagePrompt.trim()) {
      toast.warning('พิมพ์ข้อความทดสอบรูปภาพก่อน')
      return
    }
    const imageProvider = providerFromRef(imagePrimary)
    if (!imageProvider.noApiKey && !config?.env?.[imageProvider.envKey]) {
      toast.warning(`ตั้งค่า ${imageProvider.label} key ก่อน`)
      return
    }
    imageAbortRef.current?.abort()
    const controller = new AbortController()
    imageAbortRef.current = controller
    setImageTesting(true)
    setImageTestStartedAt(Date.now())
    setImageTestResult(null)

    try {
      const result = await testModelImageMessage({
        model: imagePrimary,
        prompt: imagePrompt.trim(),
        image: {
          base64: imageUpload.base64,
          mimeType: imageUpload.mimeType,
          fileName: imageUpload.fileName,
        },
      }, controller.signal)
      setImageTestResult(result)
      setRuntimeResults(prev => ({ ...prev, [runtimeKey(imagePrimary, 'image')]: result }))
      if (result.ok) {
        setLastImageTestHash(currentImageHash)
        await qc.invalidateQueries({ queryKey: ['model-readiness'] })
        toast.success('ทดสอบ Model รูปภาพผ่าน')
      } else {
        setLastImageTestHash('')
        toast.error(result.safeMessage || result.summary || 'ทดสอบ Model รูปภาพไม่ผ่าน')
      }
    } catch (error) {
      const err = error as { code?: string; name?: string; message?: string }
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
        toast.info('ยกเลิกการทดสอบรูปภาพแล้ว')
      } else {
        toast.error('ทดสอบ Model รูปภาพไม่สำเร็จ')
      }
      resetImageTest()
    } finally {
      setImageTesting(false)
      imageAbortRef.current = null
    }
  }

  function confirmDeleteKey() {
    if (!currentKey || providerForKey.noApiKey) return
    setDeleteKeyDialogOpen(true)
  }

  function confirmRestartGateway() {
    setRestartDialogOpen(true)
  }

  const selectedProviderStatus = keyTestStates[providerForKey.id] || 'idle'
  const elapsedText = messageTesting && messageTestStartedAt
    ? `${Math.max(0, Math.round((progressNowMs - messageTestStartedAt) / 1000))}s`
    : ''
  const imageElapsedText = imageTesting && imageTestStartedAt
    ? `${Math.max(0, Math.round((progressNowMs - imageTestStartedAt) / 1000))}s`
    : ''
  const primaryPassed = Boolean(primary && textModelReady(primary))
  const fallbackPassedCount = fallbacks.filter(model => textModelReady(model)).length
  const providerKeyCount = PROVIDERS.filter(provider => provider.noApiKey || config?.env?.[provider.envKey]).length
  const imageStateLabel = imagePrimary ? (imageReady ? 'พร้อม' : 'ยังไม่เปิด') : 'ปิดอยู่'

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่า Model และ Provider</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ใส่ key, เลือก model เองจาก provider ที่มี, ทดสอบจาก runtime จริง แล้วบันทึกให้ Gateway ใช้กับ chatbot
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={refreshReadiness} disabled={readinessFetching}>
              <RefreshCw className={`size-4 ${readinessFetching ? 'animate-spin' : ''}`} />
              รีเฟรช
            </Button>
            <Button type="button" variant="outline" onClick={confirmRestartGateway} disabled={restartMutation.isPending}>
              <RotateCcw className="size-4" />
              Restart Gateway
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">
          <div className="bg-card px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">Provider keys</p>
            <p className="mt-1 text-lg font-semibold">{providerKeyCount}/{PROVIDERS.length}</p>
          </div>
          <div className="bg-card px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">Model หลัก</p>
            <p className="mt-1 truncate text-lg font-semibold">{primaryPassed ? 'ทดสอบผ่าน' : primary ? 'รอทดสอบ' : 'ยังไม่เลือก'}</p>
          </div>
          <div className="bg-card px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">Model สำรอง</p>
            <p className="mt-1 text-lg font-semibold">{fallbackPassedCount}/{fallbacks.length}</p>
          </div>
          <div className="bg-card px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">Model รูปภาพ</p>
            <p className="mt-1 text-lg font-semibold">{imageStateLabel}</p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="border-b p-5 xl:border-b-0 xl:border-r">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Provider keys</h2>
                <p className="text-sm text-muted-foreground">เลือก provider ที่มี key แล้วทดสอบก่อนใช้กับ model</p>
              </div>
              <Badge variant="secondary">{providerKeyCount} พร้อมใช้งาน</Badge>
            </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {PROVIDERS.map(provider => (
              <ProviderKeyCard
                key={provider.id}
                provider={provider}
                active={providerForKey.id === provider.id}
                hasKey={Boolean(config?.env?.[provider.envKey])}
                testState={keyTestStates[provider.id] || 'idle'}
                onClick={() => setProviderForKey(provider)}
              />
            ))}
          </div>
          </div>

          <div className="bg-muted/20 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{providerForKey.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{providerForKey.envKey}</p>
              </div>
              <Badge variant={badgeVariant(selectedProviderStatus === 'idle' ? (currentKey ? 'ready' : 'missing_key') : selectedProviderStatus)}>
                {selectedProviderStatus === 'idle'
                  ? currentKey ? 'มี key' : 'ไม่มี key'
                  : selectedProviderStatus === 'ok' ? 'ทดสอบผ่าน' : 'ทดสอบไม่ผ่าน'}
              </Badge>
            </div>

            {providerForKey.noApiKey ? (
              <div className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Provider นี้ไม่ต้องใส่ key เพื่อโหลดรายชื่อ model
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={event => {
                      setApiKey(event.target.value)
                      setKeyTestStates(prev => ({ ...prev, [providerForKey.id]: 'idle' }))
                    }}
                    placeholder={currentKey ? 'มี key แล้ว, ใส่ค่าใหม่เมื่อต้องการแก้ไข' : `${providerForKey.envKey}=...`}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey(value => !value)}
                    aria-label={showKey ? 'ซ่อน key' : 'แสดง key'}
                    title={showKey ? 'ซ่อน key' : 'แสดง key'}
                  >
                    <Eye className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => testKeyMutation.mutate()} disabled={(!apiKey.trim() && !currentKey) || testKeyMutation.isPending}>
                    <ShieldCheck className="size-4" />
                    ทดสอบ key
                  </Button>
                  <Button type="button" onClick={() => saveKeyMutation.mutate()} disabled={!keyChanged || saveKeyMutation.isPending}>
                    <Save className="size-4" />
                    บันทึก key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={confirmDeleteKey}
                    disabled={!currentKey || deleteKeyMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    ลบ key
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Model ข้อความ</h2>
            <p className="text-sm text-muted-foreground">เลือก model ได้เองทั้งหมด ชุดแนะนำเป็นเพียง shortcut สำหรับเริ่มต้น</p>
          </div>
          <div className="grid gap-2 sm:min-w-[360px]">
            <label htmlFor="model-test-prompt" className="text-xs font-medium text-muted-foreground">ข้อความทดสอบ</label>
            <Input
              id="model-test-prompt"
              value={testPrompt}
              onChange={event => {
                setTestPrompt(event.target.value)
                resetTextTest()
              }}
              placeholder="เช่น สวัสดีครับ"
              className="h-10"
              disabled={messageTesting}
            />
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-4 border-b p-5 xl:border-b-0 xl:border-r">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-medium">Model หลัก</h3>
                <p className="text-sm text-muted-foreground">บังคับเลือก ใช้ตอบ chat ปกติ เลือก provider แล้วค้นหา model ที่ต้องการได้เลย</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">shortcut</span>
                <Button type="button" variant="outline" size="sm" onClick={applyOpenRouterRecommended}>
                  <CheckCircle2 className="size-4" />
                  ใส่ชุด OpenRouter แนะนำ
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={applyKiloRecommended}>
                  <CheckCircle2 className="size-4" />
                  ใส่ชุด Kilo แนะนำ
                </Button>
              </div>
            </div>
            <ModelPicker
              label="เลือก Model หลัก"
              value={primary}
              onChange={setPrimary}
              recommendedRefs={[
                OPENROUTER_RECOMMENDED.primary,
                KILO_RECOMMENDED.primary,
              ]}
              textTestResults={textTestResults}
              runtimeStateForRef={ref => runtimeState(ref, 'text')}
            />
            {primary && (
              <TextModelTestPanel
                model={primary}
                result={textTestResults[primary]}
                testing={textTestingModel === primary}
                elapsedText={elapsedText}
                onTest={() => void runTextModelTest(primary)}
                onCancel={() => messageAbortRef.current?.abort()}
              />
            )}
          </div>

          <div className="space-y-4 bg-muted/10 p-5">
            <div>
              <h3 className="text-base font-medium">Model สำรอง</h3>
              <p className="text-sm text-muted-foreground">ไม่บังคับ ใช้เมื่อ model หลัก timeout หรือ error</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <ModelPicker
                label="เพิ่ม Model สำรอง"
                value={fallbackDraft}
                onChange={setFallbackDraft}
                recommendedRefs={[
                  ...OPENROUTER_RECOMMENDED.fallbacks,
                  ...KILO_RECOMMENDED.fallbacks,
                ]}
                textTestResults={textTestResults}
                runtimeStateForRef={ref => runtimeState(ref, 'text')}
              />
              <Button type="button" variant="outline" className="min-h-11" onClick={addFallback} disabled={!fallbackDraft}>
                <Plus className="size-4" />
                เพิ่ม
              </Button>
            </div>
            <div className="space-y-2">
              {fallbacks.length === 0 ? (
                <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  ยังไม่มี Model สำรอง ถ้าไม่ต้องการ fallback สามารถปล่อยว่างได้
                </div>
              ) : fallbacks.map((item, index) => (
                <div key={item} className="space-y-2 rounded-md border px-3 py-2">
                  <div className="grid gap-2 sm:grid-cols-[32px_1fr_auto] sm:items-center">
                    <span className="text-sm text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 break-all font-mono text-sm">{item}</span>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => moveFallback(index, -1)}
                        disabled={index === 0}
                        aria-label="เลื่อน Model สำรองขึ้น"
                        title="เลื่อนขึ้น"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => moveFallback(index, 1)}
                        disabled={index === fallbacks.length - 1}
                        aria-label="เลื่อน Model สำรองลง"
                        title="เลื่อนลง"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeFallback(index)}
                        aria-label="ลบ Model สำรอง"
                        title="ลบ Model สำรอง"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <TextModelTestPanel
                    model={item}
                    result={textTestResults[item]}
                    testing={textTestingModel === item}
                    elapsedText={elapsedText}
                    onTest={() => void runTextModelTest(item)}
                    onCancel={() => messageAbortRef.current?.abort()}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Model รูปภาพ</h2>
              <Badge variant={imagePrimary ? imageReady ? 'default' : 'secondary' : 'secondary'}>{imageStateLabel}</Badge>
            </div>
                <p className="text-sm text-muted-foreground">ไม่บังคับ เปิดเฉพาะเมื่อลูกค้าส่งรูปสินค้าให้ chatbot</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImagePrimary(OPENROUTER_RECOMMENDED.imagePrimary)
                    setLastImageTestHash('')
                  }}
                >
                  <ImageIcon className="size-4" />
                  ใช้รูปภาพแนะนำ
                </Button>
                <Button type="button" variant="outline" onClick={clearImageModel} disabled={!imagePrimary}>
                  <XCircle className="size-4" />
                  ปิด Model รูปภาพ
                </Button>
              </div>
            </div>

        <div className="border-t px-5 py-4">
            {!imagePrimary ? (
              <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                ยังไม่เปิด Model รูปภาพ ส่วน chat ข้อความยังใช้งานได้ตามปกติ
              </div>
            ) : (
              <div className="space-y-3">
                {!imageReady && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
                    Model รูปภาพยังไม่ผ่านการทดสอบ จึงจะไม่ถูกบันทึกในรอบนี้ แต่ยังบันทึก Model ข้อความได้ตามปกติ
                  </div>
                )}
                <ModelPicker
                  label="เลือก Model รูปภาพ"
                  value={imagePrimary}
                  imageOnly
                  onChange={value => {
                    setImagePrimary(value)
                    resetImageTest()
                  }}
                  recommendedRefs={[OPENROUTER_RECOMMENDED.imagePrimary]}
                  runtimeStateForRef={ref => runtimeState(ref, 'image')}
                />
                <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                  <div className="space-y-2">
                    <label htmlFor="image-model-test-file" className="text-sm font-medium">รูปทดสอบ</label>
                    <label
                      htmlFor="image-model-test-file"
                      className="flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30 text-center text-sm text-muted-foreground transition hover:bg-muted/50"
                    >
                      {imageUpload ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUpload.previewUrl} alt="รูปที่ใช้ทดสอบ model" className="h-full max-h-56 w-full object-contain" />
                      ) : (
                        <span className="px-4">คลิกเพื่ออัปโหลดรูป PNG, JPG, WEBP หรือ GIF</span>
                      )}
                    </label>
                    <Input
                      id="image-model-test-file"
                      type="file"
                      accept={SUPPORTED_IMAGE_UPLOAD_TYPES.join(',')}
                      className="hidden"
                      disabled={imageTesting}
                      onChange={event => {
                        void handleImageFileChange(event.target.files?.[0] || null)
                        event.currentTarget.value = ''
                      }}
                    />
                    {imageUpload && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">{imageUpload.fileName}</span>
                        <span>{Math.ceil(imageUpload.size / 1024)}KB</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void handleImageFileChange(null)}
                          disabled={imageTesting}
                        >
                          ลบรูป
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label htmlFor="image-model-test-prompt" className="text-sm font-medium">ข้อความทดสอบรูปภาพ</label>
                      <Textarea
                        id="image-model-test-prompt"
                        value={imagePrompt}
                        onChange={event => {
                          setImagePrompt(event.target.value)
                          resetImageTest()
                        }}
                        placeholder="เช่น รูปนี้เป็นสินค้าอะไร ตอบสั้น ๆ"
                        className="min-h-24"
                        disabled={imageTesting}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {imageTesting ? (
                        <Button type="button" variant="outline" onClick={() => imageAbortRef.current?.abort()}>
                          <XCircle className="size-4" />
                          ยกเลิก
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={runImageTest}
                        disabled={!imagePrimary || !imageUpload || !imagePrompt.trim() || imageTesting}
                      >
                        <PlayCircle className="size-4" />
                        {imageTesting ? `กำลังทดสอบ ${imageElapsedText}` : 'ทดสอบรูปภาพ'}
                      </Button>
                    </div>

                    {imageTesting && (
                      <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900 dark:border-sky-950 dark:bg-sky-950/25 dark:text-sky-100">
                        กำลังส่งรูปเข้า OpenClaw runtime จริง โปรดรอคำตอบจาก AI
                      </div>
                    )}

                    {imageTestResult && (
                      <div className={`space-y-3 rounded-md border px-3 py-3 ${imageTestResult.ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-950 dark:bg-emerald-950/25' : 'border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/25'}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={imageTestResult.ok ? 'default' : 'destructive'}>
                            {imageTestResult.ok ? 'ทดสอบผ่าน' : statusLabel(imageTestResult.status)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">{imageTestResult.durationMs}ms</span>
                        </div>
                        <p className="text-sm">{imageTestResult.safeMessage || (imageTestResult.ok ? 'Model รูปภาพใช้งานได้จริง' : 'Model รูปภาพใช้งานไม่ได้')}</p>
                        {imageTestResult.outputPreview && (
                          <div className="rounded-md border bg-background/70 px-3 py-2 text-sm">
                            <p className="text-xs font-medium text-muted-foreground">คำตอบจาก AI</p>
                            <p className="mt-1 break-words">{imageTestResult.outputPreview}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
      </section>

      <section className="rounded-lg border bg-card px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              {saveReason ? (
                <>
                  <Badge variant="secondary">บันทึกปกติยังไม่พร้อม</Badge>
                  <span className="text-muted-foreground">{saveReason}</span>
                </>
              ) : (
                <>
                  <Badge>พร้อมบันทึก</Badge>
                  <span className="text-muted-foreground">หลังบันทึกแล้วให้ Restart Gateway</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => saveSettingsMutation.mutate(false)} disabled={!canSave || saveSettingsMutation.isPending}>
                <Save className="size-4" />
                {saveSettingsMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกค่า Model'}
              </Button>
              {canOverrideSave && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/25"
                  onClick={() => setOverrideSaveDialogOpen(true)}
                  disabled={saveSettingsMutation.isPending}
                >
                  <AlertTriangle className="size-4" />
                  บันทึกแบบยอมรับความเสี่ยง
                </Button>
              )}
              <Button type="button" variant="outline" onClick={confirmRestartGateway} disabled={restartMutation.isPending}>
                <RotateCcw className="size-4" />
                Restart Gateway
              </Button>
            </div>
          </div>

          {unverifiedTextModels.length ? (
            <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm">
              <p className="font-medium">Model ที่เลือกไว้แล้วยังไม่ผ่านการทดสอบ</p>
              <p className="mt-1 text-muted-foreground">
                ยังเลือก model เหล่านี้ได้ แต่ควรกดทดสอบก่อนใช้จริง ถ้าตั้งใจใช้ทันทีให้ใช้ปุ่มบันทึกแบบยอมรับความเสี่ยง
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unverifiedTextModels.map(model => (
                  <Badge key={model} variant="secondary" className="max-w-full break-all font-mono text-[11px]">
                    {compactModel(model)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {showRestartHint && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
              บันทึกแล้ว กรุณา Restart Gateway เพื่อให้ Telegram ใช้ค่าใหม่
            </div>
          )}

          {imageDraftExcluded && (
            <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Model รูปภาพเป็นส่วนเสริมและยังไม่ผ่านการทดสอบ ระบบจะไม่บันทึกค่า Model รูปภาพในรอบนี้
            </div>
          )}

          {readiness?.runtimeVerificationIssues?.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" />
                ยังมี model ที่ runtime ไม่ได้ยืนยัน
              </div>
              <p className="mt-1">กดทดสอบที่กล่องของแต่ละ model หรือทดสอบ Model รูปภาพถ้าเปิดใช้งาน</p>
            </div>
          ) : null}
      </section>

      <Dialog open={deleteKeyDialogOpen} onOpenChange={setDeleteKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ Provider Key?</DialogTitle>
            <DialogDescription>
              ระบบจะลบ key ของ {providerForKey.label} ออกจาก config หลังลบแล้ว model ที่ใช้ provider นี้อาจใช้งานไม่ได้จนกว่าจะใส่ key ใหม่
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{providerForKey.label}</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{providerForKey.envKey}</p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={deleteKeyMutation.isPending} />}>
              ยกเลิก
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteKeyMutation.mutate()}
              disabled={deleteKeyMutation.isPending}
            >
              <Trash2 className="size-4" />
              {deleteKeyMutation.isPending ? 'กำลังลบ...' : 'ลบ key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart Gateway?</DialogTitle>
            <DialogDescription>
              ใช้เมื่อบันทึกค่า model แล้วต้องการให้ Telegram และ channel อื่นใช้ค่าใหม่ ระหว่าง restart อาจมีช่วงสั้น ๆ ที่ bot ไม่รับข้อความ
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
            ตรวจสอบว่าไม่มีการทดสอบ model ค้างอยู่ก่อน restart
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={restartMutation.isPending} />}>
              ยกเลิก
            </DialogClose>
            <Button
              type="button"
              onClick={() => restartMutation.mutate()}
              disabled={restartMutation.isPending}
            >
              <RotateCcw className="size-4" />
              {restartMutation.isPending ? 'กำลัง restart...' : 'Restart Gateway'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideSaveDialogOpen} onOpenChange={setOverrideSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>บันทึกโดยไม่รอผลทดสอบครบ?</DialogTitle>
            <DialogDescription>
              ใช้เมื่อคุณตั้งใจเลือก model เองและยอมรับว่าบางตัวอาจ timeout หรือ runtime เรียกไม่ได้จริง ระบบยังจะตรวจ key และ catalog ก่อนบันทึก
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
              หลังบันทึกแล้วควรทดสอบ Telegram ทันที ถ้า bot ไม่ตอบให้กลับมาเลือก model ที่ทดสอบผ่าน หรือใช้ชุดแนะนำ
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm">
              <p className="font-medium">Model ที่จะบันทึก</p>
              <p className="break-all font-mono text-xs">Primary: {primary}</p>
              {fallbacks.map((model, index) => (
                <p key={model} className="break-all font-mono text-xs">Fallback {index + 1}: {model}</p>
              ))}
              {imagePrimary && <p className="break-all font-mono text-xs">Image: {imagePrimary}</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={saveSettingsMutation.isPending} />}>
              ยกเลิก
            </DialogClose>
            <Button
              type="button"
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => saveSettingsMutation.mutate(true)}
              disabled={saveSettingsMutation.isPending}
            >
              <AlertTriangle className="size-4" />
              {saveSettingsMutation.isPending ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TechnicalDetails readiness={readiness} runtimeResults={runtimeResults} />
    </div>
  )
}
