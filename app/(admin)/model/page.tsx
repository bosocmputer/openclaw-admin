'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getConfig,
  getModelCatalog,
  getModelReadiness,
  putConfig,
  putModelSettings,
  restartGateway,
  startAnthropicOAuth,
  testProvider,
  testModelRuntime,
  PROVIDERS,
  type AgentModelReadiness,
  type ModelCatalog,
  type ModelRuntimeTestResult,
  type ModelSettingsPayload,
  type OpenRouterModel,
  type ProviderConfig,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Check,
  ChevronsUpDown,
  ChevronDown,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Layers,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react'

type Section = 'primary' | 'fallbacks' | 'image'

const OPENROUTER_RECOMMENDED = {
  primary: 'openrouter/google/gemini-2.5-flash-lite',
  fallbacks: [
    'openrouter/qwen/qwen3.5-flash-02-23',
    'openrouter/openai/gpt-4o-mini',
  ],
  imagePrimary: 'openrouter/google/gemini-2.5-flash-lite',
  imageFallbacks: [
    'openrouter/openai/gpt-4o-mini',
    'openrouter/qwen/qwen3.5-flash-02-23',
  ],
  imageTimeoutMs: 30000,
}

const KILO_RECOMMENDED = {
  primary: 'kilocode/google/gemini-3.1-flash-lite',
  fallbacks: [
    'kilocode/kilo-auto/small',
    'kilocode/openai/gpt-4o-mini',
  ],
}

const KILO_TEXT_CANDIDATES = [
  KILO_RECOMMENDED.primary,
  ...KILO_RECOMMENDED.fallbacks,
  'kilocode/deepseek/deepseek-v4-flash',
  'kilocode/qwen/qwen3.6-flash',
  'kilocode/qwen/qwen3.5-flash-02-23',
  'kilocode/kilo-auto/free',
  'kilocode/google/gemini-3.5-flash',
  'kilocode/kilo-auto/efficient',
  'kilocode/kilo-auto/balanced',
]

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

function statusVariant(status?: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'ready' || status === 'runtime_verified' || status === 'ok') return 'default'
  if (status === 'not_configured') return 'secondary'
  if (status === 'runtime_unverified') return 'secondary'
  if (!status) return 'secondary'
  return 'destructive'
}

function statusLabel(status?: string) {
  if (status === 'ready') return 'Ready'
  if (status === 'not_configured') return 'Not configured'
  if (status === 'missing_key') return 'Missing key'
  if (status === 'auth_error') return 'Auth failed'
  if (status === 'provider_error') return 'Provider error'
  if (status === 'invalid_output') return 'Invalid output'
  if (status === 'timeout') return 'Timeout'
  if (status === 'model_not_found') return 'Not found'
  if (status === 'not_image_capable') return 'Not image-capable'
  if (status === 'capability_unknown') return 'Unknown capability'
  if (status === 'runtime_verified' || status === 'ok') return 'Runtime verified'
  if (status === 'runtime_unverified') return 'Not tested'
  if (status === 'runtime_unavailable') return 'Runtime unavailable'
  return status || 'Unknown'
}

function catalogTone(status?: string) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'missing_key') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
  if (!status) return 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
  return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
}

function catalogSummary(catalog?: ModelCatalog, provider?: ProviderConfig) {
  if (!catalog) return 'ยังไม่ได้โหลด catalog'
  if (catalog.status === 'ready') {
    return `พบ ${catalog.models.length} models จาก ${catalog.cache?.hit ? 'cache' : 'provider สด'}`
  }
  if (catalog.status === 'missing_key') return `ยังไม่ได้ตั้ง ${provider?.label || 'provider'} API key`
  return catalog.summary || statusLabel(catalog.status)
}

function inputModalities(model?: OpenRouterModel): string[] {
  const caps = model?.capabilities as Record<string, unknown> | undefined
  const raw = caps?.inputModalities || caps?.input_modalities || (model as Record<string, unknown> | undefined)?.inputModalities || (model as Record<string, unknown> | undefined)?.input
  return Array.isArray(raw) ? raw.map(item => String(item).toLowerCase()) : []
}

function isImageCapable(model?: OpenRouterModel) {
  return inputModalities(model).includes('image')
}

function catalogHasRef(catalog: ModelCatalog | undefined, ref: string) {
  if (!catalog || catalog.status !== 'ready') return false
  const provider = providerFromRef(ref)
  const modelId = modelIdFromRef(ref, provider)
  return (catalog.models || []).some(model => (
    model.id === modelId ||
    `${provider.modelPrefix}/${model.id}` === ref
  ))
}

function formatPrice(model?: OpenRouterModel) {
  const prompt = Number.parseFloat(String(model?.pricing?.prompt || '0'))
  const completion = Number.parseFloat(String(model?.pricing?.completion || '0'))
  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return ''
  const input = prompt > 0 ? `$${(prompt * 1_000_000).toFixed(2)}` : 'free'
  const output = completion > 0 ? `$${(completion * 1_000_000).toFixed(2)}` : 'free'
  return `${input}/${output} per 1M`
}

function compactModel(ref: string) {
  return ref.replace(/^openrouter\//, '')
}

function runtimeKey(ref: string, capability: 'text' | 'image') {
  return `${capability}:${ref}`
}

function runtimeStatusTone(status?: string) {
  if (status === 'runtime_verified' || status === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'runtime_unverified' || !status) return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
  return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
}

function isRuntimeVerified(status?: string) {
  return status === 'runtime_verified' || status === 'ok'
}

function draftHash(payload: ModelSettingsPayload) {
  return JSON.stringify(payload)
}

function ModelPicker({
  label,
  value,
  onChange,
  imageOnly = false,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  imageOnly?: boolean
  disabled?: boolean
}) {
  const initialProvider = providerFromRef(value)
  const [fallbackProvider, setFallbackProvider] = useState<ProviderConfig>(initialProvider)
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const provider = value ? providerFromRef(value) : fallbackProvider

  const { data: catalog, isFetching } = useQuery({
    queryKey: ['models-catalog', provider.id],
    queryFn: () => getModelCatalog(provider.id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const modelId = modelIdFromRef(value, provider)
  const selected = catalog?.models?.find(model => model.id === modelId)
  const visibleModels = useMemo(() => {
    const models = catalog?.models || []
    if (!imageOnly) return models
    return models.filter(isImageCapable)
  }, [catalog, imageOnly])
  const hiddenUnknownCount = imageOnly
    ? Math.max(0, (catalog?.models?.length || 0) - visibleModels.length)
    : 0

  async function refreshCatalog() {
    try {
      const next = await getModelCatalog(provider.id, true)
      qc.setQueryData(['models-catalog', provider.id], next)
      if (next.status === 'ready') toast.success(`โหลด ${next.models.length} models จาก ${provider.label}`)
      else toast.warning(statusLabel(next.status))
    } catch {
      toast.error('Refresh model catalog ไม่สำเร็จ')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {imageOnly && <p className="text-xs text-zinc-500">แสดงเฉพาะ model ที่ provider ยืนยันว่า input เป็น image ได้</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refreshCatalog} disabled={isFetching || disabled}>
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {PROVIDERS.map(item => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              setFallbackProvider(item)
              onChange('')
            }}
            className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${
              item.id === provider.id
                ? 'border-zinc-900 bg-zinc-100 font-medium dark:border-zinc-100 dark:bg-zinc-800'
                : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span className="block truncate">{item.label}</span>
            {item.id === 'kilocode' && <span className="block truncate text-[10px] text-amber-600 dark:text-amber-300">runtime test required</span>}
          </button>
        ))}
      </div>

      <div className={`rounded-md border px-3 py-2 text-xs ${catalogTone(catalog?.status)}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{statusLabel(catalog?.status)}</span>
          {catalog?.cache?.hit && <span>Using cache</span>}
        </div>
        <p className="mt-1">{catalogSummary(catalog, provider)}</p>
        {hiddenUnknownCount > 0 && (
          <p className="mt-1">ซ่อน {hiddenUnknownCount} models ที่ provider ไม่ส่ง image capability ชัดเจน</p>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          role="combobox"
          aria-expanded={open}
          disabled={disabled || catalog?.status !== 'ready'}
          onClick={() => setOpen(value => !value)}
          className="inline-flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="truncate text-left">
            {value ? (selected?.name || compactModel(value)) : 'เลือก model...'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="ค้นหา model..." />
            <CommandList>
              <CommandEmpty>ไม่พบ model ที่เลือกได้</CommandEmpty>
              {visibleModels.map(model => {
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
                        <p className="truncate">{model.name || model.id}</p>
                        <p className="truncate font-mono text-xs text-zinc-400">{ref}</p>
                      </div>
                    </div>
                    {formatPrice(model) && <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">{formatPrice(model)}</span>}
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <div className="rounded-md border px-3 py-2 text-xs text-zinc-500">
          <p className="break-all font-mono text-zinc-700 dark:text-zinc-300">{value}</p>
          {selected && formatPrice(selected) && <p className="mt-1">{formatPrice(selected)}</p>}
        </div>
      )}
    </div>
  )
}

function ReadinessBadge({ status }: { status?: string }) {
  return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
}

type RuntimeRef = {
  role: string
  ref: string
  capability: 'text' | 'image'
}

type RuntimeView = {
  status: string
  summary: string
  durationMs?: number | null
  runtimeVersion?: string | null
  testedAt?: string | null
  expectedOutput?: string | null
  outputPreview?: string | null
  failureReason?: string | null
}

function RuntimeBadge({ status }: { status?: string }) {
  return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
}

function RuntimeVerificationPanel({
  refs,
  stateFor,
  onTestOne,
  onTestAll,
  testing,
}: {
  refs: RuntimeRef[]
  stateFor: (ref: RuntimeRef) => RuntimeView
  onTestOne: (ref: RuntimeRef) => void
  onTestAll: () => void
  testing: boolean
}) {
  const visibleRefs = refs.filter(item => item.ref)
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">Runtime verification</p>
          <p className="mt-1 text-xs text-zinc-500">
            Catalog และ key ยังไม่พอ ต้องทดสอบผ่าน OpenClaw runtime ก่อน Save เพื่อกัน model ที่ runtime ไม่รู้จัก
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onTestAll} disabled={testing || visibleRefs.length === 0}>
          <PlayCircle className="size-4" />
          Test all before save
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {visibleRefs.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            เลือก primary model ก่อนเริ่มทดสอบ runtime
          </div>
        ) : visibleRefs.map(item => {
          const state = stateFor(item)
          return (
            <div key={`${item.capability}:${item.role}:${item.ref}`} className={`rounded-md border px-3 py-2 text-xs ${runtimeStatusTone(state.status)}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <RuntimeBadge status={state.status} />
                    <span className="font-medium">{item.role}</span>
                    <span className="rounded bg-white/60 px-1.5 py-0.5 text-[11px] dark:bg-zinc-950/30">{item.capability}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-zinc-700 dark:text-zinc-200">{item.ref}</p>
                  <p className="mt-1">{state.summary}</p>
                  {(state.failureReason || state.outputPreview) && (
                    <div className="mt-1 space-y-1 text-zinc-500 dark:text-zinc-300">
                      {state.failureReason && <p>Reason: {state.failureReason}</p>}
                      {state.outputPreview && <p className="break-all font-mono">Output: {state.outputPreview}</p>}
                    </div>
                  )}
                  {(state.durationMs || state.runtimeVersion) && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-zinc-500 dark:text-zinc-300">
                      {state.durationMs ? <span className="inline-flex items-center gap-1"><Timer className="size-3" />{state.durationMs}ms</span> : null}
                      {state.runtimeVersion ? <span className="font-mono">{state.runtimeVersion}</span> : null}
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onTestOne(item)} disabled={testing}>
                  <PlayCircle className="size-4" />
                  Test
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChainSummary({ title, primary, fallbackCount }: { title: string; primary?: string; fallbackCount?: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 truncate font-mono text-sm">{primary || '-'}</p>
      <p className="mt-1 text-xs text-zinc-500">{fallbackCount || 0} fallback model(s)</p>
    </div>
  )
}

function AdvisorModelRow({
  item,
  state,
}: {
  item: RuntimeRef
  state: RuntimeView
}) {
  return (
    <div className="rounded-md border px-3 py-3 text-xs">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <RuntimeBadge status={state.status} />
            <span className="font-medium">{item.role}</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-300">
              {item.capability}
            </span>
          </div>
          <p className="break-all font-mono leading-relaxed text-zinc-600 dark:text-zinc-300">{item.ref}</p>
          {(state.failureReason || state.outputPreview) && (
            <p className="break-all text-zinc-500">
              {state.failureReason ? `${state.failureReason}: ` : ''}{state.outputPreview || ''}
            </p>
          )}
        </div>
        <p className="text-zinc-500 md:max-w-[260px] md:text-right">{state.summary}</p>
      </div>
    </div>
  )
}

function ModelAdvisor({
  textRefs,
  imageRefs,
  stateFor,
  onApplyText,
  onTestText,
  onTestImage,
  onClearImage,
  testing,
}: {
  textRefs: RuntimeRef[]
  imageRefs: RuntimeRef[]
  stateFor: (ref: RuntimeRef) => RuntimeView
  onApplyText: () => void
  onTestText: () => void
  onTestImage: () => void
  onClearImage: () => void
  testing: boolean
}) {
  const textStates = textRefs.map(item => ({ item, state: stateFor(item) }))
  const imageStates = imageRefs.map(item => ({ item, state: stateFor(item) }))
  const verifiedTextCount = textStates.filter(({ state }) => isRuntimeVerified(state.status)).length
  const textReady = textRefs.length > 0 && verifiedTextCount === textRefs.length
  const imageVerifiedCount = imageStates.filter(({ state }) => isRuntimeVerified(state.status)).length
  const imageHasUnsupported = imageStates.some(({ state }) => state.status === 'not_image_capable')
  const imageReady = imageRefs.length > 0 && imageVerifiedCount === imageRefs.length

  return (
    <Card className="border-sky-200 bg-sky-50/70 dark:border-sky-950 dark:bg-sky-950/20">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-sky-900 dark:text-sky-100">
              <ShieldCheck className="size-4" />
              Model Advisor
            </CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-sky-800/80 dark:text-sky-200/80">
              เลือก model จากผลทดสอบจริง ไม่ใช่จาก catalog อย่างเดียว: key ต้องพร้อม, model ต้องมีอยู่จริง, และ OpenClaw runtime ต้องเรียกได้สำเร็จ
            </p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button type="button" className="w-full sm:w-auto" onClick={onApplyText} disabled={testing}>
              <Zap className="size-4" />
              Apply recommended text
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onTestText} disabled={testing}>
              <PlayCircle className="size-4" />
              Test text chain
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Recommended text setup</p>
              <Badge variant={textReady ? 'default' : 'secondary'}>{textReady ? 'Ready' : 'Needs test'}</Badge>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              เหมาะกับ Telegram chat ทั่วไป: primary เร็ว, fallback สองชั้น, ค่าใช้จ่ายต่ำ และผ่าน runtime test ได้จริงเมื่อ verified ครบ
            </p>
            <p className="mt-2 text-xs text-zinc-500">{verifiedTextCount}/{textRefs.length} text model verified</p>
          </div>

          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Image understanding</p>
              <Badge variant={imageReady ? 'default' : 'destructive'}>{imageReady ? 'Ready' : 'Not ready'}</Badge>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              {imageHasUnsupported
                ? 'OpenClaw runtime ยังไม่รับ image input สำหรับชุด OpenRouter ที่ทดสอบ จึงไม่ควร save เป็น production image model'
                : 'ต้องมี image model ที่ผ่าน runtime test ก่อนเปิดใช้กับลูกค้าที่ส่งรูปสินค้า'}
            </p>
            <div className="mt-2 grid gap-2 sm:flex sm:flex-wrap">
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onTestImage} disabled={testing || imageRefs.length === 0}>
                <PlayCircle className="size-4" />
                Test image chain
              </Button>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onClearImage} disabled={testing}>
                Disable image config
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Admin rule</p>
              <Badge variant="secondary">Safe default</Badge>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              แสดง model ที่ผ่านจริงก่อน ส่วน provider อื่นเช่น Kilo หรือ image model ให้ใช้ได้หลัง runtime test ผ่านเท่านั้น
            </p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-sky-900 dark:text-sky-100">Recommended text chain</p>
            {textStates.map(({ item, state }) => (
              <AdvisorModelRow key={`${item.capability}:${item.ref}`} item={item} state={state} />
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-sky-900 dark:text-sky-100">Image candidates</p>
            {imageStates.map(({ item, state }) => (
              <AdvisorModelRow key={`${item.capability}:${item.ref}`} item={item} state={state} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function KiloAdvisor({
  catalog,
  hasKey,
  candidates,
  stateFor,
  onFindUsable,
  onApplyText,
  testing,
}: {
  catalog?: ModelCatalog
  hasKey: boolean
  candidates: RuntimeRef[]
  stateFor: (ref: RuntimeRef) => RuntimeView
  onFindUsable: () => void
  onApplyText: () => void
  testing: boolean
}) {
  const candidateStates = candidates.map(item => ({ item, state: stateFor(item) }))
  const verified = candidateStates
    .filter(({ state }) => isRuntimeVerified(state.status))
    .sort((a, b) => (a.state.durationMs || Number.MAX_SAFE_INTEGER) - (b.state.durationMs || Number.MAX_SAFE_INTEGER))
  const failed = candidateStates.filter(({ state }) => (
    state.status !== 'runtime_unverified' &&
    !isRuntimeVerified(state.status)
  ))
  const recommendedRefs = [
    KILO_RECOMMENDED.primary,
    ...KILO_RECOMMENDED.fallbacks,
  ]
  const recommendedReady = recommendedRefs.every(ref => isRuntimeVerified(stateFor({ role: ref, ref, capability: 'text' }).status))

  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-950 dark:bg-amber-950/20">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base text-amber-950 dark:text-amber-100">
              <KeyRound className="size-4" />
              Kilo AI runtime readiness
              <Badge variant="secondary">Experimental until runtime verified</Badge>
            </CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-amber-900/80 dark:text-amber-100/80">
              Catalog ready หมายถึงเห็นรายชื่อ model เท่านั้น ต้อง runtime verified ก่อนใช้กับ Telegram production
            </p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onFindUsable} disabled={testing || !hasKey || catalog?.status !== 'ready' || candidates.length === 0}>
              <PlayCircle className="size-4" />
              Find usable Kilo models
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={onApplyText} disabled={testing || !recommendedReady}>
              <Zap className="size-4" />
              Apply verified Kilo text
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <p className="text-sm font-medium">Catalog</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ReadinessBadge status={catalog?.status || 'runtime_unverified'} />
              <span className="text-xs text-zinc-500">{catalog?.models?.length || 0} models</span>
            </div>
            {(catalog?.warnings || []).map(warning => (
              <p key={warning} className="mt-2 text-xs text-amber-800 dark:text-amber-200">{warning}</p>
            ))}
          </div>
          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <p className="text-sm font-medium">Key</p>
            <div className="mt-2">
              <ReadinessBadge status={hasKey ? 'ready' : 'missing_key'} />
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              {hasKey ? 'มี Kilo key สำหรับ inference จริง' : 'บันทึก Kilo key ก่อน runtime test'}
            </p>
          </div>
          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <p className="text-sm font-medium">Usable text models</p>
            <p className="mt-2 text-2xl font-semibold">{verified.length}</p>
            <p className="text-xs text-zinc-500">ผ่าน runtime test จาก shortlist นี้</p>
          </div>
          <div className="rounded-md border bg-white/80 px-3 py-3 dark:bg-zinc-950/40">
            <p className="text-sm font-medium">Image policy</p>
            <Badge className="mt-2" variant="destructive">Not production-ready</Badge>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              จากผลทดสอบปัจจุบัน Kilo image ยังคืน error หรือไม่รองรับ image ผ่าน runtime
            </p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-950 dark:text-amber-100">Verified, fastest first</p>
            {verified.length === 0 ? (
              <div className="rounded-md border bg-white/70 px-3 py-3 text-sm text-zinc-600 dark:bg-zinc-950/30 dark:text-zinc-300">
                กด Find usable Kilo models เพื่อทดสอบ runtime ก่อนเลือกใช้
              </div>
            ) : verified.map(({ item, state }) => (
              <AdvisorModelRow key={`kilo-ok:${item.ref}`} item={item} state={state} />
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-950 dark:text-amber-100">Failed or untested shortlist</p>
            {candidateStates.map(({ item, state }) => (
              <AdvisorModelRow key={`kilo-all:${item.ref}`} item={item} state={state} />
            ))}
            {failed.length > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                ถ้าเป็น model_not_found หรือ timeout ไม่ควร save เป็น production model แม้ catalog จะแสดงชื่ออยู่
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SetupStatusCard({
  title,
  status,
  badge,
  children,
}: {
  title: string
  status: 'ready' | 'warn' | 'fail' | 'idle'
  badge: string
  children: ReactNode
}) {
  const tone = status === 'ready'
    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100'
    : status === 'fail'
      ? 'border-red-200 bg-red-50/70 text-red-950 dark:border-red-950 dark:bg-red-950/20 dark:text-red-100'
      : status === 'warn'
        ? 'border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-950 dark:bg-amber-950/20 dark:text-amber-100'
        : 'border-zinc-200 bg-zinc-50/80 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100'
  const badgeVariant = status === 'ready' ? 'default' : status === 'fail' ? 'destructive' : 'secondary'
  return (
    <div className={`rounded-md border px-3 py-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant={badgeVariant}>{badge}</Badge>
      </div>
      <div className="mt-2 text-sm leading-relaxed opacity-85">{children}</div>
    </div>
  )
}

function AdminModelSetup({
  textRefs,
  imageRefs,
  kiloRefs,
  stateFor,
  primary,
  fallbackCount,
  imagePrimary,
  imageFallbackCount,
  kiloCatalog,
  kiloHasKey,
  readinessOk,
  blockingCount,
  warningCount,
  draftValidated,
  testing,
  validating,
  saving,
  restarting,
  canValidate,
  canSave,
  onApplyOpenRouter,
  onFindKilo,
  onApplyKilo,
  onTestText,
  onValidate,
  onSave,
  onRestart,
  onClearImage,
}: {
  textRefs: RuntimeRef[]
  imageRefs: RuntimeRef[]
  kiloRefs: RuntimeRef[]
  stateFor: (ref: RuntimeRef) => RuntimeView
  primary: string
  fallbackCount: number
  imagePrimary: string
  imageFallbackCount: number
  kiloCatalog?: ModelCatalog
  kiloHasKey: boolean
  readinessOk: boolean
  blockingCount: number
  warningCount: number
  draftValidated: boolean
  testing: boolean
  validating: boolean
  saving: boolean
  restarting: boolean
  canValidate: boolean
  canSave: boolean
  onApplyOpenRouter: () => void
  onFindKilo: () => void
  onApplyKilo: () => void
  onTestText: () => void
  onValidate: () => void
  onSave: () => void
  onRestart: () => void
  onClearImage: () => void
}) {
  const textStates = textRefs.map(item => stateFor(item))
  const textReady = textRefs.length > 0 && textStates.every(state => isRuntimeVerified(state.status))
  const textFailed = textStates.some(state => state.status && !['runtime_unverified', 'runtime_verified', 'ok'].includes(state.status))
  const imageStates = imageRefs.map(item => stateFor(item))
  const imageConfigured = Boolean(imagePrimary)
  const imageReady = imageRefs.length > 0 && imageStates.every(state => isRuntimeVerified(state.status))
  const imageFailed = imageStates.some(state => state.status && !['runtime_unverified', 'runtime_verified', 'ok'].includes(state.status))
  const kiloStates = kiloRefs.map(item => stateFor(item))
  const kiloVerifiedCount = kiloStates.filter(state => isRuntimeVerified(state.status)).length
  const kiloReady = kiloVerifiedCount > 0

  const nextActions = []
  if (!primary) nextActions.push('เลือกหรือ apply ชุด model สำหรับข้อความ')
  else if (!textReady) nextActions.push('กด Test current text models ให้ผ่านก่อน')
  else if (!draftValidated) nextActions.push('กด Validate เพื่อตรวจ config ก่อนบันทึก')
  else if (!readinessOk) nextActions.push('กด Save settings แล้ว restart gateway')
  if (imageConfigured && !imageReady) nextActions.push('รูปสินค้ายังไม่พร้อม: ปิด image config หรือเลือก model ที่ผ่านจริง')
  if (!kiloHasKey) nextActions.push('ถ้าจะใช้ Kilo ให้บันทึก Kilo key ใน Advanced')
  const visibleActions = nextActions.slice(0, 4)

  return (
    <Card className="border-zinc-300 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/40">
      <CardHeader>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5" />
              Model Setup
            </CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-300">
              สำหรับ admin ทั่วไป ให้ทำตามแถวนี้ก่อน: เลือกชุด model, ทดสอบ, validate, save แล้ว restart.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onApplyOpenRouter} disabled={testing || saving}>
              <Zap className="size-4" />
              ใช้ OpenRouter แนะนำ
            </Button>
            <Button type="button" variant="outline" onClick={onFindKilo} disabled={testing || !kiloHasKey || kiloCatalog?.status !== 'ready'}>
              <PlayCircle className="size-4" />
              หา Kilo ที่ใช้ได้
            </Button>
            <Button type="button" onClick={onApplyKilo} disabled={testing || !kiloReady}>
              <CheckCircle2 className="size-4" />
              ใช้ Kilo ที่ผ่านแล้ว
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <SetupStatusCard
            title="ข้อความ Telegram"
            status={textReady ? 'ready' : textFailed ? 'fail' : 'warn'}
            badge={textReady ? 'พร้อมใช้' : textFailed ? 'ต้องแก้' : 'ต้องทดสอบ'}
          >
            <p className="break-all font-mono text-xs">{primary || 'ยังไม่เลือก primary model'}</p>
            <p className="mt-1">{fallbackCount} fallback model(s)</p>
          </SetupStatusCard>
          <SetupStatusCard
            title="Kilo AI"
            status={kiloReady ? 'ready' : kiloHasKey ? 'warn' : 'idle'}
            badge={kiloReady ? `${kiloVerifiedCount} ใช้ได้` : kiloHasKey ? 'รอ test' : 'ยังไม่มี key'}
          >
            <p>{catalogSummary(kiloCatalog, PROVIDERS.find(provider => provider.id === 'kilocode'))}</p>
            <p className="mt-1">ใช้กับ production หลัง runtime verified เท่านั้น</p>
          </SetupStatusCard>
          <SetupStatusCard
            title="รูปสินค้า"
            status={!imageConfigured ? 'idle' : imageReady ? 'ready' : imageFailed ? 'fail' : 'warn'}
            badge={!imageConfigured ? 'ปิดอยู่' : imageReady ? 'พร้อมใช้' : imageFailed ? 'ยังใช้ไม่ได้' : 'ต้องทดสอบ'}
          >
            <p className="break-all font-mono text-xs">{imagePrimary || 'ไม่ได้ตั้ง image model'}</p>
            <p className="mt-1">{imageFallbackCount} image fallback(s)</p>
          </SetupStatusCard>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_420px]">
          <div className="rounded-md border bg-white px-3 py-3 dark:bg-zinc-950/50">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={readinessOk ? 'default' : 'secondary'}>{readinessOk ? 'พร้อมบันทึก' : 'ต้องตรวจเพิ่ม'}</Badge>
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                {blockingCount} blocking issue(s), {warningCount} warning(s)
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onTestText} disabled={!primary || testing}>
                <PlayCircle className="size-4" />
                Test current text models
              </Button>
              <Button type="button" variant="outline" onClick={onValidate} disabled={!canValidate || validating}>
                <ShieldCheck className="size-4" />
                Validate
              </Button>
              <Button type="button" onClick={onSave} disabled={!canSave || saving}>
                <Save className="size-4" />
                Save settings
              </Button>
              <Button type="button" variant="outline" onClick={onRestart} disabled={restarting}>
                <RotateCcw className="size-4" />
                Restart gateway
              </Button>
              {imageConfigured && !imageReady && (
                <Button type="button" variant="outline" onClick={onClearImage} disabled={testing || saving}>
                  <ImageIcon className="size-4" />
                  ปิด image config
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border bg-white px-3 py-3 dark:bg-zinc-950/50">
            <p className="text-sm font-medium">ควรทำต่อ</p>
            {visibleActions.length ? (
              <ol className="mt-2 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                {visibleActions.map((item, index) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">ไม่มี action เร่งด่วน เหลือแค่ทดสอบ Telegram จริงหลัง restart</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AgentMatrix({ agents }: { agents: AgentModelReadiness[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-Agent Readiness</CardTitle>
        <p className="text-sm text-zinc-500">ดูว่า agent ไหน inherit default และ agent ไหน override model/image model เอง</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:hidden">
          {agents.map(agent => (
            <div key={agent.id} className="space-y-3 rounded-md border px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{agent.id}</p>
                <p className="text-xs text-zinc-500">
                  model: {agent.modelSource}, image: {agent.imageModelSource}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-500">Primary</p>
                <div className="flex flex-wrap items-center gap-2">
                  <ReadinessBadge status={agent.model.primary.status} />
                  <RuntimeBadge status={agent.model.primary.runtimeStatus || 'runtime_unverified'} />
                  <span className="min-w-0 break-all font-mono text-xs">{agent.model.primary.ref || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-zinc-500">Fallbacks</p>
                  <p>{agent.model.fallbacks.length}</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-500">Image</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ReadinessBadge status={agent.usesImageTool ? agent.imageModel.primary.status : 'ready'} />
                    {agent.usesImageTool && <RuntimeBadge status={agent.imageModel.primary.runtimeStatus || 'runtime_unverified'} />}
                  </div>
                </div>
              </div>

              <p className="break-all font-mono text-xs text-zinc-600 dark:text-zinc-300">
                {agent.usesImageTool ? (agent.imageModel.primary.ref || 'not configured') : 'not used'}
              </p>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Agent</th>
                <th className="py-2 pr-3 font-medium">Primary</th>
                <th className="py-2 pr-3 font-medium">Fallbacks</th>
                <th className="py-2 pr-3 font-medium">Image</th>
                <th className="py-2 pr-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 font-medium">{agent.id}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <ReadinessBadge status={agent.model.primary.status} />
                      <RuntimeBadge status={agent.model.primary.runtimeStatus || 'runtime_unverified'} />
                      <span className="max-w-[260px] truncate font-mono text-xs">{agent.model.primary.ref || '-'}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">{agent.model.fallbacks.length}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <ReadinessBadge status={agent.usesImageTool ? agent.imageModel.primary.status : 'ready'} />
                      {agent.usesImageTool && <RuntimeBadge status={agent.imageModel.primary.runtimeStatus || 'runtime_unverified'} />}
                      <span className="max-w-[260px] truncate font-mono text-xs">
                        {agent.usesImageTool ? (agent.imageModel.primary.ref || 'not configured') : 'not used'}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-500">
                    model: {agent.modelSource}, image: {agent.imageModelSource}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ModelPage() {
  const qc = useQueryClient()
  const [section, setSection] = useState<Section>('primary')
  const [providerForKey, setProviderForKey] = useState<ProviderConfig>(PROVIDERS[0])
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [oauthUrl, setOauthUrl] = useState('')
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState('')

  const [primary, setPrimary] = useState('')
  const [fallbackDraft, setFallbackDraft] = useState('')
  const [fallbacks, setFallbacks] = useState<string[]>([])
  const [imagePrimary, setImagePrimary] = useState('')
  const [imageFallbackDraft, setImageFallbackDraft] = useState('')
  const [imageFallbacks, setImageFallbacks] = useState<string[]>([])
  const [imageTimeoutMs, setImageTimeoutMs] = useState(30000)
  const [validatedHash, setValidatedHash] = useState('')
  const [showRestartHint, setShowRestartHint] = useState(false)
  const [runtimeResults, setRuntimeResults] = useState<Record<string, ModelRuntimeTestResult>>({})

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: readiness, isFetching: readinessFetching } = useQuery({
    queryKey: ['model-readiness'],
    queryFn: () => getModelReadiness(),
    staleTime: 30_000,
  })
  const { data: kiloCatalog } = useQuery({
    queryKey: ['models-catalog', 'kilocode'],
    queryFn: () => getModelCatalog('kilocode'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('section')
    if (wanted === 'fallbacks' || wanted === 'image' || wanted === 'primary') setSection(wanted)
  }, [])

  useEffect(() => {
    if (!config) return
    const defaults = config.agents?.defaults || {}
    setPrimary(defaults.model?.primary || '')
    setFallbacks(defaults.model?.fallbacks || [])
    setImagePrimary(defaults.imageModel?.primary || '')
    setImageFallbacks(defaults.imageModel?.fallbacks || [])
    setImageTimeoutMs(defaults.imageModel?.timeoutMs || 30000)
  }, [config])

  useEffect(() => {
    if (!config) return
    setApiKey(config.env?.[providerForKey.envKey] || '')
    setTestResult('idle')
  }, [config, providerForKey])

  const payload = useMemo<ModelSettingsPayload>(() => ({
    defaults: {
      model: { primary, fallbacks },
      imageModel: imagePrimary
        ? { primary: imagePrimary, fallbacks: imageFallbacks, timeoutMs: imageTimeoutMs }
        : null,
    },
  }), [fallbacks, imageFallbacks, imagePrimary, imageTimeoutMs, primary])

  const currentHash = draftHash(payload)
  const draftValidated = validatedHash === currentHash
  const runtimeRefs = useMemo<RuntimeRef[]>(() => {
    const refs: RuntimeRef[] = []
    if (primary) refs.push({ role: 'Primary model', ref: primary, capability: 'text' })
    fallbacks.forEach((ref, index) => {
      if (ref) refs.push({ role: `Fallback ${index + 1}`, ref, capability: 'text' })
    })
    if (imagePrimary) refs.push({ role: 'Image primary', ref: imagePrimary, capability: 'image' })
    imageFallbacks.forEach((ref, index) => {
      if (ref) refs.push({ role: `Image fallback ${index + 1}`, ref, capability: 'image' })
    })
    const seen = new Set<string>()
    return refs.filter(item => {
      const key = runtimeKey(item.ref, item.capability)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [fallbacks, imageFallbacks, imagePrimary, primary])
  const recommendedTextRefs = useMemo<RuntimeRef[]>(() => ([
    { role: 'Primary model', ref: OPENROUTER_RECOMMENDED.primary, capability: 'text' },
    ...OPENROUTER_RECOMMENDED.fallbacks.map((ref, index) => ({
      role: `Fallback ${index + 1}`,
      ref,
      capability: 'text' as const,
    })),
  ]), [])
  const recommendedImageRefs = useMemo<RuntimeRef[]>(() => ([
    { role: 'Image primary', ref: OPENROUTER_RECOMMENDED.imagePrimary, capability: 'image' },
    ...OPENROUTER_RECOMMENDED.imageFallbacks.map((ref, index) => ({
      role: `Image fallback ${index + 1}`,
      ref,
      capability: 'image' as const,
    })),
  ]), [])
  const kiloTextRefs = useMemo<RuntimeRef[]>(() => (
    KILO_TEXT_CANDIDATES
      .filter(ref => catalogHasRef(kiloCatalog, ref))
      .map((ref, index) => ({
        role: ref === KILO_RECOMMENDED.primary
          ? 'Kilo primary'
          : KILO_RECOMMENDED.fallbacks.includes(ref)
            ? `Kilo fallback ${KILO_RECOMMENDED.fallbacks.indexOf(ref) + 1}`
            : `Kilo candidate ${index + 1}`,
        ref,
        capability: 'text' as const,
      }))
  ), [kiloCatalog])

  const readinessRuntimeByKey = useMemo(() => {
    const map = new Map<string, RuntimeView>()
    const add = (item?: {
      ref?: string
      capability?: string | null
      runtimeStatus?: string | null
      runtimeSummary?: string | null
      runtimeDurationMs?: number | null
      runtimeVersion?: string | null
      runtimeTestedAt?: string | null
    }) => {
      if (!item?.ref) return
      const capability = item.capability === 'image' ? 'image' : 'text'
      map.set(runtimeKey(item.ref, capability), {
        status: item.runtimeStatus || 'runtime_unverified',
        summary: item.runtimeSummary || 'Runtime test has not been run for this model',
        durationMs: item.runtimeDurationMs,
        runtimeVersion: item.runtimeVersion,
        testedAt: item.runtimeTestedAt,
      })
    }
    add(readiness?.defaults.model.primary)
    readiness?.defaults.model.fallbacks.forEach(add)
    add(readiness?.defaults.imageModel.primary)
    readiness?.defaults.imageModel.fallbacks.forEach(add)
    return map
  }, [readiness])

  function runtimeStateFor(item: RuntimeRef): RuntimeView {
    const key = runtimeKey(item.ref, item.capability)
    const local = runtimeResults[key]
    if (local) {
      return {
        status: local.ok ? 'runtime_verified' : local.status,
        summary: local.safeMessage || local.summary,
        durationMs: local.durationMs,
        runtimeVersion: local.runtimeVersion,
        testedAt: local.testedAt,
        expectedOutput: local.expectedOutput,
        outputPreview: local.outputPreview || local.data?.outputPreview,
        failureReason: local.failureReason,
      }
    }
    return readinessRuntimeByKey.get(key) || {
      status: 'runtime_unverified',
      summary: 'Runtime test has not been run for this model',
      durationMs: null,
      runtimeVersion: null,
      testedAt: null,
    }
  }

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
      toast.success('บันทึก provider key แล้ว')
    },
    onError: () => toast.error('บันทึก provider key ไม่สำเร็จ'),
  })

  const testKeyMutation = useMutation({
    mutationFn: () => testProvider(providerForKey.id, apiKey.trim()),
    onSuccess: ok => {
      setTestResult(ok ? 'ok' : 'fail')
      if (ok) toast.success('Provider key ใช้งานได้')
      else toast.error('Provider key ใช้งานไม่ได้')
    },
    onError: () => {
      setTestResult('fail')
      toast.error('ทดสอบ provider key ไม่สำเร็จ')
    },
  })

  const runtimeTestMutation = useMutation({
    mutationFn: (item: RuntimeRef) => testModelRuntime({
      model: item.ref,
      capability: item.capability,
      mode: 'gateway',
      refresh: true,
    }),
    onSuccess: async (result, item) => {
      setRuntimeResults(prev => ({ ...prev, [runtimeKey(item.ref, item.capability)]: result }))
      await qc.invalidateQueries({ queryKey: ['model-readiness'] })
      if (result.ok) {
        toast.success(`Runtime test ผ่าน: ${compactModel(item.ref)}`)
      } else {
        toast.error(result.safeMessage || result.summary || 'Runtime test ไม่ผ่าน')
      }
    },
    onError: () => toast.error('Runtime test ไม่สำเร็จ'),
  })

  const validateMutation = useMutation({
    mutationFn: () => putModelSettings(payload, true),
    onSuccess: async data => {
      qc.setQueryData(['model-readiness'], data.readiness)
      setValidatedHash(currentHash)
      toast.success('Validate ผ่านแล้ว พร้อม Save')
    },
    onError: (error: unknown) => {
      setValidatedHash('')
      const data = (error as { response?: { data?: { error?: string; blockingIssues?: Array<{ summary?: string; ref?: string }> } } })?.response?.data
      const firstIssue = data?.blockingIssues?.[0]
      const message = firstIssue
        ? `${data?.error || 'Validate ไม่ผ่าน'}: ${firstIssue.ref ? `${firstIssue.ref} ` : ''}${firstIssue.summary || ''}`
        : data?.error || 'Validate ไม่ผ่าน'
      toast.error(message)
    },
  })

  const saveSettingsMutation = useMutation({
    mutationFn: () => putModelSettings(payload, false),
    onSuccess: async data => {
      qc.setQueryData(['model-readiness'], data.readiness)
      await qc.invalidateQueries({ queryKey: ['config'] })
      setShowRestartHint(true)
      setValidatedHash(currentHash)
      toast.success(`บันทึก model settings แล้ว${data.write?.backupId ? ` · backup ${data.write.backupId}` : ''}`)
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
    onSuccess: () => toast.success('Restart Gateway สำเร็จ'),
    onError: () => toast.error('Restart Gateway ไม่สำเร็จ'),
  })

  async function refreshReadiness() {
    try {
      const next = await getModelReadiness(true)
      qc.setQueryData(['model-readiness'], next)
      toast.success('Refresh readiness แล้ว')
    } catch {
      toast.error('Refresh readiness ไม่สำเร็จ')
    }
  }

  async function testRuntimeRefs(items: RuntimeRef[], validateAfter = false) {
    const refs = items.filter(item => item.ref)
    if (!refs.length) {
      toast.warning('เลือก model ก่อนทดสอบ runtime')
      return
    }
    let failed = 0
    for (const item of refs) {
      const result = await runtimeTestMutation.mutateAsync(item)
      if (!result.ok) failed += 1
    }
    if (failed) {
      toast.error(`Runtime test ไม่ผ่าน ${failed} รายการ`)
      setValidatedHash('')
      return
    }
    toast.success('Runtime test ผ่านทุก model ใน draft')
    if (validateAfter) validateMutation.mutate()
  }

  async function findUsableKiloModels() {
    if (!config?.env?.KILOCODE_API_KEY) {
      toast.warning('บันทึก Kilo key ก่อนทดสอบ runtime')
      return
    }
    if (kiloCatalog?.status !== 'ready') {
      toast.warning('Kilo catalog ยังไม่พร้อม กรุณา refresh หรือบันทึก key ก่อน')
      return
    }
    if (!kiloTextRefs.length) {
      toast.warning('ไม่พบ Kilo shortlist ใน catalog ปัจจุบัน')
      return
    }
    let passed = 0
    let failed = 0
    for (const item of kiloTextRefs) {
      const result = await runtimeTestMutation.mutateAsync(item)
      if (result.ok) passed += 1
      else failed += 1
    }
    if (passed) toast.success(`พบ Kilo model ที่ runtime ใช้ได้ ${passed} รายการ`)
    if (failed) toast.warning(`Kilo runtime test ไม่ผ่าน ${failed} รายการ`)
    setValidatedHash('')
  }

  async function startOAuth() {
    try {
      const { url } = await startAnthropicOAuth()
      setOauthUrl(url)
      setOauthRedirectUrl('')
    } catch {
      toast.error('เริ่ม Anthropic OAuth ไม่สำเร็จ')
    }
  }

  async function submitOAuth() {
    if (!oauthRedirectUrl.trim()) return
    try {
      const res = await fetch('/api/oauth/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: oauthRedirectUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setOauthUrl('')
      setOauthRedirectUrl('')
      await qc.invalidateQueries({ queryKey: ['config'] })
      await qc.invalidateQueries({ queryKey: ['model-readiness'] })
      toast.success(data.message || 'เชื่อมต่อ Anthropic OAuth แล้ว')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เชื่อมต่อ OAuth ไม่สำเร็จ')
    }
  }

  function setTab(next: Section) {
    setSection(next)
    const url = new URL(window.location.href)
    url.searchParams.set('section', next)
    window.history.replaceState(null, '', url.toString())
  }

  function addFallback(image = false) {
    const value = image ? imageFallbackDraft : fallbackDraft
    if (!value) return
    if (image) {
      if (!imageFallbacks.includes(value) && value !== imagePrimary) setImageFallbacks(items => [...items, value])
      setImageFallbackDraft('')
    } else {
      if (!fallbacks.includes(value) && value !== primary) setFallbacks(items => [...items, value])
      setFallbackDraft('')
    }
    setValidatedHash('')
  }

  function removeFallback(index: number, image = false) {
    if (image) setImageFallbacks(items => items.filter((_, i) => i !== index))
    else setFallbacks(items => items.filter((_, i) => i !== index))
    setValidatedHash('')
  }

  function moveFallback(index: number, direction: -1 | 1, image = false) {
    const setter = image ? setImageFallbacks : setFallbacks
    setter(items => {
      const next = [...items]
      const target = index + direction
      if (target < 0 || target >= next.length) return next
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setValidatedHash('')
  }

  const currentKey = config?.env?.[providerForKey.envKey] || ''
  const keyChanged = !providerForKey.noApiKey && apiKey.trim() !== currentKey

  function applyRecommendedOpenRouterText() {
    setPrimary(OPENROUTER_RECOMMENDED.primary)
    setFallbacks(OPENROUTER_RECOMMENDED.fallbacks)
    setValidatedHash('')
    setSection('fallbacks')
    const url = new URL(window.location.href)
    url.searchParams.set('section', 'fallbacks')
    window.history.replaceState(null, '', url.toString())
    toast.info('ใส่ชุด OpenRouter text ที่แนะนำแล้ว กด Test all + Validate ก่อน Save')
  }

  function applyVerifiedKiloText() {
    const refs = [KILO_RECOMMENDED.primary, ...KILO_RECOMMENDED.fallbacks]
    const missing = refs.filter(ref => !isRuntimeVerified(runtimeStateFor({ role: ref, ref, capability: 'text' }).status))
    if (missing.length) {
      toast.error('ต้อง runtime verify Kilo primary และ fallback ให้ครบก่อน apply')
      return
    }
    setPrimary(KILO_RECOMMENDED.primary)
    setFallbacks(KILO_RECOMMENDED.fallbacks)
    setValidatedHash('')
    setSection('fallbacks')
    const url = new URL(window.location.href)
    url.searchParams.set('section', 'fallbacks')
    window.history.replaceState(null, '', url.toString())
    toast.info('ใส่ชุด Kilo text ที่ verified แล้ว กด Validate ก่อน Save')
  }

  function clearImageConfig() {
    setImagePrimary('')
    setImageFallbacks([])
    setImageFallbackDraft('')
    setImageTimeoutMs(OPENROUTER_RECOMMENDED.imageTimeoutMs)
    setValidatedHash('')
    setSection('image')
    const url = new URL(window.location.href)
    url.searchParams.set('section', 'image')
    window.history.replaceState(null, '', url.toString())
    toast.info('ปิด image model draft แล้ว จนกว่าจะมี model ที่ runtime test ผ่าน')
  }

  const draftTextRefs = runtimeRefs.filter(item => item.capability === 'text')
  const draftImageRefs = runtimeRefs.filter(item => item.capability === 'image')
  const overallReady = Boolean(readiness?.ok && !readiness.runtimeVerificationIssues?.length)
  const busy = runtimeTestMutation.isPending || validateMutation.isPending

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">เลือก Model ให้ Chatbot</h1>
          <p className="mt-1 text-sm text-zinc-500">
            หน้านี้เช็คว่า key, model และ OpenClaw runtime ใช้งานด้วยกันได้จริง ก่อนนำไปใช้กับ Telegram.
          </p>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" className="w-full sm:w-auto" onClick={refreshReadiness} disabled={readinessFetching}>
            <RefreshCw className={`size-4 ${readinessFetching ? 'animate-spin' : ''}`} />
            Refresh readiness
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => restartMutation.mutate()} disabled={restartMutation.isPending}>
            <RotateCcw className="size-4" />
            Restart Gateway
          </Button>
        </div>
      </div>

      <AdminModelSetup
        textRefs={draftTextRefs}
        imageRefs={draftImageRefs}
        kiloRefs={kiloTextRefs}
        stateFor={runtimeStateFor}
        primary={primary}
        fallbackCount={fallbacks.length}
        imagePrimary={imagePrimary}
        imageFallbackCount={imageFallbacks.length}
        kiloCatalog={kiloCatalog}
        kiloHasKey={Boolean(config?.env?.KILOCODE_API_KEY)}
        readinessOk={overallReady}
        blockingCount={readiness?.blockingIssues.length || 0}
        warningCount={readiness?.warnings.length || 0}
        draftValidated={draftValidated}
        testing={runtimeTestMutation.isPending}
        validating={validateMutation.isPending}
        saving={saveSettingsMutation.isPending}
        restarting={restartMutation.isPending}
        canValidate={Boolean(primary) && !validateMutation.isPending}
        canSave={draftValidated && !saveSettingsMutation.isPending}
        onApplyOpenRouter={applyRecommendedOpenRouterText}
        onFindKilo={findUsableKiloModels}
        onApplyKilo={applyVerifiedKiloText}
        onTestText={() => testRuntimeRefs(draftTextRefs)}
        onValidate={() => validateMutation.mutate()}
        onSave={() => saveSettingsMutation.mutate()}
        onRestart={() => restartMutation.mutate()}
        onClearImage={clearImageConfig}
      />

      <details className="group rounded-md border bg-white dark:bg-zinc-950/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Settings2 className="size-4" />
              Advanced diagnostics
            </p>
            <p className="mt-1 text-xs text-zinc-500">เปิดเมื่ออยากดู runtime result, recommended chain และ Kilo shortlist แบบละเอียด</p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t p-4">
          <ModelAdvisor
            textRefs={recommendedTextRefs}
            imageRefs={recommendedImageRefs}
            stateFor={runtimeStateFor}
            onApplyText={applyRecommendedOpenRouterText}
            onTestText={() => testRuntimeRefs(recommendedTextRefs)}
            onTestImage={() => testRuntimeRefs(recommendedImageRefs)}
            onClearImage={clearImageConfig}
            testing={busy}
          />

          <KiloAdvisor
            catalog={kiloCatalog}
            hasKey={Boolean(config?.env?.KILOCODE_API_KEY)}
            candidates={kiloTextRefs}
            stateFor={runtimeStateFor}
            onFindUsable={findUsableKiloModels}
            onApplyText={applyVerifiedKiloText}
            testing={busy}
          />
        </div>
      </details>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-zinc-500">Readiness</p>
                <p className="mt-1 text-2xl font-semibold">{readiness?.ok ? 'Ready' : 'Needs attention'}</p>
              </div>
              <ReadinessBadge status={readiness?.ok ? 'ready' : 'warn'} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{readiness?.blockingIssues.length || 0} blocking issue(s), {readiness?.warnings.length || 0} warning(s)</p>
          </CardContent>
        </Card>
        <ChainSummary title="Default primary" primary={primary} fallbackCount={fallbacks.length} />
        <ChainSummary title="Default image model" primary={imagePrimary || 'not configured'} fallbackCount={imageFallbacks.length} />
      </div>

      {readiness?.blockingIssues.length ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-300">
              <AlertTriangle className="size-4" />
              Validation Blocking Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readiness.blockingIssues.slice(0, 8).map(issue => (
              <div key={`${issue.scope}-${issue.ref}-${issue.status}`} className="rounded-md border border-red-200 bg-white/70 px-3 py-2 text-sm dark:border-red-900 dark:bg-zinc-950/40">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{statusLabel(issue.status)}</Badge>
                  <span className="font-mono text-xs">{issue.scope}</span>
                </div>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">{issue.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {showRestartHint && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">Model settings saved</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">Restart gateway และ reset active sessions หลังเปลี่ยน model เพื่อให้ runtime ใช้ค่าใหม่ทันที</p>
            </div>
            <Button onClick={() => restartMutation.mutate()} disabled={restartMutation.isPending}>
              <RotateCcw className="size-4" />
              Restart now
            </Button>
          </CardContent>
        </Card>
      )}

      <details className="group rounded-md border bg-white dark:bg-zinc-950/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4" />
              Advanced setup
            </p>
            <p className="mt-1 text-xs text-zinc-500">บันทึก provider key หรือเลือก model เองเมื่อชุดแนะนำยังไม่พอ</p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
        </summary>
        <div className="grid gap-5 border-t p-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" />
                Provider Credentials
              </CardTitle>
              <p className="text-sm text-zinc-500">บันทึก key ก่อน validate model catalog ถ้า provider ต้องใช้ key</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setProviderForKey(provider)}
                    className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${
                      providerForKey.id === provider.id
                        ? 'border-zinc-900 bg-zinc-100 font-medium dark:border-zinc-100 dark:bg-zinc-800'
                        : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800'
                    }`}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>

              {providerForKey.noApiKey ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Provider นี้โหลด catalog ได้โดยไม่ต้องมี key แต่การ infer จริงอาจยังต้องตั้ง billing/key ตาม provider
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={event => {
                        setApiKey(event.target.value)
                        setTestResult('idle')
                      }}
                      placeholder={`${providerForKey.envKey}=...`}
                      className="font-mono text-sm"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowKey(value => !value)} aria-label={showKey ? 'Hide key' : 'Show key'}>
                      <Eye className="size-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => testKeyMutation.mutate()} disabled={!apiKey.trim() || testKeyMutation.isPending}>
                      <ShieldCheck className="size-4" />
                      Test key
                    </Button>
                    <Button type="button" size="sm" onClick={() => saveKeyMutation.mutate()} disabled={!keyChanged || saveKeyMutation.isPending}>
                      <Save className="size-4" />
                      Save key
                    </Button>
                    {testResult === 'ok' && <Badge>Key ok</Badge>}
                    {testResult === 'fail' && <Badge variant="destructive">Key failed</Badge>}
                  </div>
                </div>
              )}

              {providerForKey.id === 'anthropic' && (
                <div className="space-y-2 rounded-md border px-3 py-3">
                  <p className="text-sm font-medium">Anthropic OAuth</p>
                  <p className="text-xs text-zinc-500">ใช้เมื่อ server เก็บ token แบบ Claude account OAuth</p>
                  {!oauthUrl ? (
                    <Button type="button" variant="outline" size="sm" onClick={startOAuth}>Start OAuth</Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input readOnly value={oauthUrl} className="font-mono text-xs" />
                        <Button type="button" variant="outline" size="sm" onClick={() => window.open(oauthUrl, '_blank')}>Open</Button>
                      </div>
                      <Input
                        value={oauthRedirectUrl}
                        onChange={event => setOauthRedirectUrl(event.target.value)}
                        placeholder="วาง callback URL หลัง login"
                        className="font-mono text-xs"
                      />
                      <Button type="button" size="sm" onClick={submitOAuth} disabled={!oauthRedirectUrl.trim()}>Submit OAuth</Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provider Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(readiness?.providers || {}).length === 0 ? (
                <p className="text-sm text-zinc-500">Provider catalog จะปรากฏหลัง validate หรือ refresh readiness</p>
              ) : Object.entries(readiness?.providers || {}).map(([provider, status]) => (
                <div key={provider} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{provider}</p>
                    <p className="truncate text-xs text-zinc-500">{status.modelCount} models · {status.source}</p>
                  </div>
                  <ReadinessBadge status={status.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model Settings</CardTitle>
            <p className="text-sm text-zinc-500">Validate ต้องผ่านก่อน Save เพื่อกันค่า model ที่ไม่มีจริงหรือ image model ที่ไม่รองรับรูป</p>
          </CardHeader>
          <CardContent>
            <RuntimeVerificationPanel
              refs={runtimeRefs}
              stateFor={runtimeStateFor}
              onTestOne={item => runtimeTestMutation.mutate(item)}
              onTestAll={() => testRuntimeRefs(runtimeRefs, true)}
              testing={runtimeTestMutation.isPending || validateMutation.isPending}
            />
            <Tabs value={section} onValueChange={value => setTab(value as Section)} className="mt-5 space-y-5">
              <TabsList className="w-full flex-wrap justify-start">
                <TabsTrigger value="primary"><Zap className="size-4" />Primary Model</TabsTrigger>
                <TabsTrigger value="fallbacks"><Layers className="size-4" />Fallback Models</TabsTrigger>
                <TabsTrigger value="image"><ImageIcon className="size-4" />Image Understanding</TabsTrigger>
              </TabsList>

              <TabsContent value="primary" className="space-y-4">
                <ModelPicker
                  label="Default primary model"
                  value={primary}
                  onChange={value => {
                    setPrimary(value)
                    setValidatedHash('')
                  }}
                />
                <Button type="button" variant="outline" onClick={() => primary && runtimeTestMutation.mutate({ role: 'Primary model', ref: primary, capability: 'text' })} disabled={!primary || runtimeTestMutation.isPending}>
                  <PlayCircle className="size-4" />
                  Test selected primary
                </Button>
              </TabsContent>

              <TabsContent value="fallbacks" className="space-y-4">
                <ModelPicker label="Add fallback model" value={fallbackDraft} onChange={setFallbackDraft} />
                <Button type="button" variant="outline" onClick={() => addFallback(false)} disabled={!fallbackDraft}>
                  Add fallback
                </Button>
                <Button type="button" variant="outline" onClick={() => testRuntimeRefs(fallbacks.map((ref, index) => ({ role: `Fallback ${index + 1}`, ref, capability: 'text' as const })))} disabled={!fallbacks.length || runtimeTestMutation.isPending}>
                  <PlayCircle className="size-4" />
                  Test fallback chain
                </Button>
                <div className="space-y-2">
                  {fallbacks.length === 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      ยังไม่มี fallback model ถ้า provider หลัก timeout Telegram อาจช้า หรือเห็น error จาก model
                    </div>
                  )}
                  {fallbacks.map((item, index) => (
                    <div key={item} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <span className="w-6 text-sm text-zinc-500">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-sm">{item}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => moveFallback(index, -1)} disabled={index === 0} aria-label="Move fallback up">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => moveFallback(index, 1)} disabled={index === fallbacks.length - 1} aria-label="Move fallback down">
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => removeFallback(index)} aria-label="Remove fallback">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="image" className="space-y-4">
                <ModelPicker
                  label="Default image understanding model"
                  value={imagePrimary}
                  imageOnly
                  onChange={value => {
                    setImagePrimary(value)
                    setValidatedHash('')
                  }}
                />
                <Button type="button" variant="outline" onClick={() => testRuntimeRefs([{ role: 'Image primary', ref: imagePrimary, capability: 'image' }, ...imageFallbacks.map((ref, index) => ({ role: `Image fallback ${index + 1}`, ref, capability: 'image' as const }))])} disabled={!imagePrimary || runtimeTestMutation.isPending}>
                  <PlayCircle className="size-4" />
                  Test image chain
                </Button>
                <div className="max-w-xs space-y-1">
                  <label className="text-sm font-medium" htmlFor="image-timeout">Image timeout (ms)</label>
                  <Input
                    id="image-timeout"
                    type="number"
                    min={1000}
                    max={180000}
                    step={1000}
                    value={imageTimeoutMs}
                    onChange={event => {
                      setImageTimeoutMs(Number(event.target.value))
                      setValidatedHash('')
                    }}
                  />
                </div>
                <div className="rounded-md border px-3 py-3">
                  <ModelPicker label="Add image fallback" value={imageFallbackDraft} imageOnly onChange={setImageFallbackDraft} disabled={!imagePrimary} />
                  <Button type="button" variant="outline" className="mt-3" onClick={() => addFallback(true)} disabled={!imageFallbackDraft || !imagePrimary}>
                    Add image fallback
                  </Button>
                  <div className="mt-3 space-y-2">
                    {imageFallbacks.map((item, index) => (
                      <div key={item} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="w-6 text-sm text-zinc-500">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-sm">{item}</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => moveFallback(index, -1, true)} disabled={index === 0} aria-label="Move image fallback up">
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => moveFallback(index, 1, true)} disabled={index === imageFallbacks.length - 1} aria-label="Move image fallback down">
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => removeFallback(index, true)} aria-label="Remove image fallback">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-zinc-500">
                  {draftValidated ? 'Validated draft พร้อมบันทึก' : 'ต้อง Validate draft ปัจจุบันก่อน Save'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => validateMutation.mutate()} disabled={!primary || validateMutation.isPending}>
                    <ShieldCheck className="size-4" />
                    {validateMutation.isPending ? 'Validating...' : 'Validate'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => testRuntimeRefs(runtimeRefs, true)} disabled={!primary || runtimeTestMutation.isPending || validateMutation.isPending}>
                    <PlayCircle className="size-4" />
                    Test all + Validate
                  </Button>
                  <Button type="button" onClick={() => saveSettingsMutation.mutate()} disabled={!draftValidated || saveSettingsMutation.isPending}>
                    <Save className="size-4" />
                    {saveSettingsMutation.isPending ? 'Saving...' : 'Save settings'}
                  </Button>
                </div>
              </div>
            </Tabs>
          </CardContent>
          </Card>
        </div>
      </details>

      <details className="group rounded-md border bg-white dark:bg-zinc-950/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Per-agent status</p>
            <p className="mt-1 text-xs text-zinc-500">ดูว่า agent ไหน inherit default หรือ override model เอง</p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">
          <AgentMatrix agents={readiness?.agents || []} />
        </div>
      </details>
    </div>
  )
}
