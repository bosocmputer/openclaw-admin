'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, putConfig, getModelCatalog, testProvider, restartGateway, startAnthropicOAuth, PROVIDERS, type ModelCatalog, type ProviderConfig } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { toast } from 'sonner'
import { ChevronsUpDown, Check, AlertCircle, RefreshCw } from 'lucide-react'

function parseProviderFromModel(model: string): string {
  const p = PROVIDERS.find(pr => model.startsWith(pr.modelPrefix + '/'))
  return p?.id ?? 'openrouter'
}

function parseModelId(model: string, prefix: string): string {
  return model.startsWith(prefix + '/') ? model.slice(prefix.length + 1) : model
}

function formatPrice(val?: string) {
  const n = parseFloat(String(val || ''))
  if (isNaN(n) || n === 0) return 'ฟรี'
  return `$${(n * 1_000_000).toFixed(2)}/1M`
}

const RECOMMENDED = [
  { id: 'openrouter/openrouter/free',             label: 'ฟรี',         desc: 'OpenRouter Free — ทดสอบ' },
  { id: 'openrouter/qwen/qwen3.5-flash-02-23',    label: 'ประหยัดสุด',  desc: 'Qwen 3.5 Flash — Thai ดี, ราคาถูก' },
  { id: 'openrouter/qwen/qwen3.5-27b',            label: 'แนะนำ ⭐',    desc: 'Qwen 3.5 27B — สมดุลราคา/ประสิทธิภาพ' },
  { id: 'openrouter/qwen/qwen3.5-122b-a10b',      label: 'ดีที่สุด',    desc: 'Qwen 3.5 122B — ประสิทธิภาพสูงสุด' },
]

function catalogStatusText(status?: string) {
  if (status === 'ready') return 'Ready'
  if (status === 'missing_key') return 'Missing key'
  if (status === 'auth_error') return 'Auth failed'
  if (status === 'timeout') return 'Provider timeout'
  if (status === 'provider_error') return 'Provider error'
  if (status === 'unknown_provider') return 'Unknown provider'
  return 'Checking'
}

function catalogStatusClass(status?: string) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'missing_key') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
  if (!status) return 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
  return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
}

function catalogHelp(catalog?: ModelCatalog, provider?: ProviderConfig) {
  if (!catalog) return 'กำลังตรวจสอบ model catalog จาก provider'
  if (catalog.status === 'ready') {
    const source = catalog.cache?.hit ? 'cache' : 'provider สด'
    return `พบ ${catalog.models.length} models จาก ${source}${provider?.id === 'kilocode' && catalog.warnings.length ? ' แต่ต้องตั้ง API key ก่อนใช้งานจริง' : ''}`
  }
  if (catalog.status === 'missing_key') return `ยังไม่ได้ตั้ง ${provider?.label || 'provider'} API key จึงยังไม่โหลด model จาก provider`
  if (catalog.status === 'auth_error') return 'API key ใช้ไม่ได้หรือ token ถูกปฏิเสธ กรุณาตรวจ key แล้วลองใหม่'
  if (catalog.status === 'timeout') return 'provider ตอบช้าเกินกำหนด ลอง refresh อีกครั้งหรือรอสักครู่'
  return catalog.summary || 'โหลด model catalog ไม่สำเร็จ'
}

export default function ModelPage() {
  const qc = useQueryClient()
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig>(PROVIDERS[0])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [testing, setTesting] = useState(false)
  const savedProviderRef = useRef<string>('')
  const savedModelRef = useRef<string>('')

  // Anthropic OAuth state
  const [oauthStep, setOauthStep] = useState<'idle' | 'waiting' | 'submitting' | 'done'>('idle')
  const [oauthUrl, setOauthUrl] = useState('')
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState('')
  const [oauthError, setOauthError] = useState('')

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: modelCatalog, isLoading: modelsLoading, isError: modelsError, isFetching: modelsFetching } = useQuery({
    queryKey: ['models', selectedProvider.id],
    queryFn: () => getModelCatalog(selectedProvider.id),
    enabled: !!config,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // โหลด current provider + model + api key จาก config
  useEffect(() => {
    if (!config) return
    const current = config.agents?.defaults?.model?.primary ?? ''
    if (current) {
      const pId = parseProviderFromModel(current)
      const provider = PROVIDERS.find(p => p.id === pId) ?? PROVIDERS[0]
      const modelId = parseModelId(current, provider.modelPrefix)
      savedProviderRef.current = provider.id
      savedModelRef.current = modelId
      setSelectedProvider(provider)
      setSelectedModelId(modelId)
      setApiKey(config.env?.[provider.envKey] ?? '')
    } else {
      setApiKey(config.env?.[PROVIDERS[0].envKey] ?? '')
    }
  }, [config])

  // เมื่อ user เปลี่ยน provider
  useEffect(() => {
    if (!config) return
    setApiKey(config.env?.[selectedProvider.envKey] ?? '')
    setTestResult('idle')
    setSelectedModelId(selectedProvider.id === savedProviderRef.current ? savedModelRef.current : '')
  }, [selectedProvider]) // eslint-disable-line react-hooks/exhaustive-deps

  // Anthropic OAuth token → ไม่ใส่ prefix (openclaw รู้จัก claude-* โดยตรง)
  // Anthropic API key ปกติ → ใส่ prefix anthropic/
  // Provider อื่น → ใส่ prefix ตามปกติ
  // (คำนวณหลัง isAnthropicOAuth — ดูด้านล่าง)
  const currentModel = config?.agents?.defaults?.model?.primary ?? '-'
  const modelList = modelCatalog?.models ?? []
  const selectedModelInfo = modelList.find(m => m.id === selectedModelId)
  const recommendedModels = selectedProvider.id === 'openrouter'
    ? RECOMMENDED
      .map(r => ({ ...r, modelId: parseModelId(r.id, 'openrouter') }))
      .filter(r => modelList.some(m => m.id === r.modelId))
    : []
  const staleRecommendedCount = selectedProvider.id === 'openrouter'
    ? RECOMMENDED.length - recommendedModels.length
    : 0

  async function refreshModels() {
    try {
      const data = await getModelCatalog(selectedProvider.id, true)
      qc.setQueryData(['models', selectedProvider.id], data)
      if (data.status === 'ready') toast.success(`โหลด ${data.models.length} models จาก provider แล้ว`)
      else toast.warning(catalogStatusText(data.status))
    } catch {
      toast.error('Refresh models ไม่สำเร็จ')
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult('idle')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const ok = await testProvider(selectedProvider.id, apiKey.trim(), controller.signal)
      setTestResult(ok ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    } finally {
      clearTimeout(timer)
      setTesting(false)
    }
  }

  async function handleOAuthStart() {
    setOauthError('')
    setOauthStep('waiting')
    try {
      const { url } = await startAnthropicOAuth()
      setOauthUrl(url)
    } catch {
      setOauthError('ไม่สามารถเริ่ม OAuth ได้ — กรุณาลองใหม่')
      setOauthStep('idle')
    }
  }

  async function handleOAuthSubmit() {
    if (!oauthRedirectUrl.trim()) return
    setOauthError('')
    setOauthStep('submitting')
    try {
      // fetch โดยตรง ไม่ผ่าน /api/proxy
      const res = await fetch('/api/oauth/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: oauthRedirectUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setOauthStep('done')
      setOauthRedirectUrl('')
      setOauthUrl('')
      await qc.invalidateQueries({ queryKey: ['config'] })
      await qc.refetchQueries({ queryKey: ['config'] })
      // switch ไป Anthropic provider + reset step เพื่อให้ model list แสดง
      const anthropicProvider = PROVIDERS.find(p => p.id === 'anthropic')
      if (anthropicProvider) setSelectedProvider(anthropicProvider)
      setOauthStep('idle')
      setSelectedModelId('')
      toast.success(data.message || 'เชื่อมต่อ Anthropic Account สำเร็จ')
    } catch (e: unknown) {
      const err = e as Error
      setOauthError(err?.message || 'เกิดข้อผิดพลาด')
      setOauthStep('waiting')
    }
  }

  async function handleAnthropicLogout() {
    if (!config) return
    try {
      // ลบทั้ง token และ model เพื่อป้องกัน error
      const updated = {
        ...config,
        env: { ...config.env, ANTHROPIC_API_KEY: '' },
        agents: {
          ...config.agents,
          defaults: {
            ...config.agents?.defaults,
            model: {
              ...config.agents?.defaults?.model,
              // ถ้า model ปัจจุบันเป็น Anthropic ให้ล้างออก
              primary: (config.agents?.defaults?.model?.primary ?? '').startsWith('anthropic/')
                ? ''
                : config.agents?.defaults?.model?.primary,
            },
          },
        },
      }
      await import('@/lib/api').then(m => m.putConfig(updated))
      await qc.invalidateQueries({ queryKey: ['config'] })
      await qc.refetchQueries({ queryKey: ['config'] })
      setApiKey('')
      setOauthStep('idle')
      setSelectedModelId('')
      toast.success('ยกเลิกการเชื่อมต่อ Anthropic Account แล้ว — model ถูกล้างออกด้วย')
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    }
  }

  const [oauthTesting, setOauthTesting] = useState(false)
  const [oauthTestResult, setOauthTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')

  async function handleOAuthTest() {
    if (!currentAnthropicKey) return
    setOauthTesting(true)
    setOauthTestResult('idle')
    try {
      const ok = await testProvider('anthropic-oauth', currentAnthropicKey)
      setOauthTestResult(ok ? 'ok' : 'fail')
    } catch {
      setOauthTestResult('fail')
    } finally {
      setOauthTesting(false)
    }
  }

  // ตรวจว่า Anthropic key ที่มีอยู่เป็น OAuth token ไหม
  const currentAnthropicKey = config?.env?.ANTHROPIC_API_KEY ?? ''
  const isAnthropicOAuth = currentAnthropicKey.includes('sk-ant-oat')
  const isAnthropicConnected = currentAnthropicKey.length > 0

  // fullModel คำนวณหลัง isAnthropicOAuth เพื่อหลีกเลี่ยง used before declaration
  const fullModel = selectedModelId
    ? (selectedProvider.id === 'anthropic' && isAnthropicOAuth
        ? selectedModelId
        : `${selectedProvider.modelPrefix}/${selectedModelId}`)
    : ''


  const [savedOnce, setSavedOnce] = useState(false)

  const restartMutation = useMutation({
    mutationFn: restartGateway,
    onSuccess: () => toast.success('Restart Gateway สำเร็จ'),
    onError: () => toast.error('Restart Gateway ไม่สำเร็จ'),
  })

  // บันทึก API key + model ในครั้งเดียว
  const saveMutation = useMutation({
    mutationFn: async ({ saveKey, saveModel }: { saveKey: boolean; saveModel: boolean }) => {
      if (!config) return
      const updated = { ...config }
      // ไม่ save key เมื่อ Anthropic OAuth active — ป้องกัน OpenRouter key ทับ OAuth token
      const shouldSaveKey = saveKey && !selectedProvider.noApiKey && !(selectedProvider.id === 'anthropic' && isAnthropicOAuth)
      if (shouldSaveKey) {
        updated.env = { ...config.env, [selectedProvider.envKey]: apiKey.trim() }
      }
      if (saveModel && fullModel) {
        updated.agents = {
          ...config.agents,
          defaults: { ...config.agents?.defaults, model: { primary: fullModel } },
        }
      }
      await putConfig(updated)
    },
    onSuccess: (_, { saveKey, saveModel }) => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setSavedOnce(true)
      if (saveKey && saveModel) toast.success('บันทึก API Key และ Model แล้ว')
      else if (saveKey) toast.success('บันทึก API Key แล้ว')
      else toast.success('บันทึก Model แล้ว')
    },
    onError: () => toast.error('บันทึกไม่สำเร็จ'),
  })

  const currentKeyInConfig = config?.env?.[selectedProvider.envKey] ?? ''
  // ไม่นับว่า key เปลี่ยนเมื่อ Anthropic OAuth active (input ถูกซ่อน ค่าใน state อาจเป็น key เก่า)
  const keyChanged = !selectedProvider.noApiKey
    && !(selectedProvider.id === 'anthropic' && isAnthropicOAuth)
    && apiKey.trim() !== currentKeyInConfig
  const modelChanged = !!fullModel && fullModel !== currentModel

  const PROVIDER_INFO: Record<string, { desc: string; keyUrl?: string; keyHint?: string }> = {
    openrouter: {
      desc: 'รองรับ model หลายร้อยตัวจากหลาย provider ในที่เดียว — แนะนำสำหรับผู้เริ่มต้น',
      keyUrl: 'openrouter.ai/keys',
      keyHint: 'สมัครฟรี → Settings → API Keys → Create Key',
    },
    anthropic: {
      desc: 'Claude โดย Anthropic — เก่งด้านการวิเคราะห์และภาษาไทย',
      keyUrl: 'console.anthropic.com/keys',
      keyHint: 'สมัคร → API Keys → Create Key',
    },
    google: {
      desc: 'Gemini โดย Google — context window ใหญ่ รองรับรูปภาพ',
      keyUrl: 'aistudio.google.com/apikey',
      keyHint: 'Login ด้วย Google Account → Create API Key',
    },
    openai: {
      desc: 'GPT-4o และ GPT-4.1 โดย OpenAI — ใช้งานกว้างขวางที่สุด',
      keyUrl: 'platform.openai.com/api-keys',
      keyHint: 'สมัคร → API keys → Create new secret key',
    },
    mistral: {
      desc: 'Mistral AI — model ยุโรป ราคาถูก เร็ว',
      keyUrl: 'console.mistral.ai/api-keys',
      keyHint: 'สมัคร → API Keys → Create new key',
    },
    groq: {
      desc: 'Groq — inference เร็วมาก ใช้ chip พิเศษ มี free tier',
      keyUrl: 'console.groq.com/keys',
      keyHint: 'สมัครฟรี → API Keys → Create API Key',
    },
    kilocode: {
      desc: 'Kilo AI — รวม model ชั้นนำหลายตัว คิดค่าใช้จ่ายตาม usage จริง',
      keyUrl: 'app.kilo.ai',
      keyHint: 'Login → Settings → API Keys → Generate Key',
    },
  }

  const providerInfo = PROVIDER_INFO[selectedProvider.id]

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Model</h1>
        <p className="text-sm text-zinc-500 mt-1">เลือก AI Provider และ Model สำหรับ bot — หลังบันทึกต้อง Restart Gateway เพื่อให้มีผล</p>
      </div>

      {/* ขั้นตอน 1: เลือก Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ขั้นตอนที่ 1 — เลือก AI Provider</CardTitle>
          <p className="text-xs text-zinc-500 mt-1">
            ใช้อยู่ตอนนี้:&nbsp;
            <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{currentModel}</span>
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProvider(p)}
                className={`px-3 py-2 rounded-md border text-sm transition-colors text-left ${
                  selectedProvider.id === p.id
                    ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800 font-medium'
                    : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {providerInfo && (
            <p className="text-xs text-zinc-500 pt-1">{providerInfo.desc}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* คอลัมน์ซ้าย */}
        <div className="space-y-4">

          {/* ขั้นตอน 2: API Key (ซ่อนถ้าไม่ต้องการ key หรือใช้ Anthropic OAuth) */}
          {!selectedProvider.noApiKey && !(selectedProvider.id === 'anthropic' && isAnthropicOAuth) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ขั้นตอนที่ 2 — ใส่ API Key</CardTitle>
                {providerInfo?.keyUrl && (
                  <p className="text-xs text-zinc-500 mt-1">
                    รับ key ได้ที่ <span className="font-mono text-blue-600 dark:text-blue-400">{providerInfo.keyUrl}</span>
                    {providerInfo.keyHint && <span className="ml-1">— {providerInfo.keyHint}</span>}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setTestResult('idle') }}
                    placeholder="วาง API Key ที่นี่..."
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={() => setShowKey(v => !v)}>
                    {showKey ? 'ซ่อน' : 'แสดง'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || !apiKey.trim()}
                  >
                    {testing ? 'กำลังทดสอบ...' : 'ทดสอบ'}
                  </Button>
                </div>
                {testResult === 'ok' && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ API Key ใช้งานได้</p>
                )}
                {testResult === 'fail' && (
                  <p className="text-xs text-red-500">✗ API Key ไม่ถูกต้อง หรือเชื่อมต่อไม่ได้</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Kilo AI — แจ้งว่าไม่ต้อง key */}
          {selectedProvider.noApiKey && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
              <CardContent className="pt-4">
                <p className="text-sm text-green-700 dark:text-green-400">
                  ✓ <strong>{selectedProvider.label}</strong> ไม่ต้องใช้ API Key — เลือก Model แล้วบันทึกได้เลย
                </p>
              </CardContent>
            </Card>
          )}

          {/* Anthropic OAuth — Claude Pro/Max subscription */}
          {selectedProvider.id === 'anthropic' && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-700 dark:text-orange-400">
                  🔐 มี Claude Pro/Max? เชื่อมต่อได้เลยโดยไม่ต้องซื้อ API Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* แสดงสถานะปัจจุบัน */}
                {isAnthropicConnected && oauthStep === 'idle' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md bg-white dark:bg-zinc-900 border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isAnthropicOAuth ? 'bg-green-500' : 'bg-blue-400'}`} />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">
                          {isAnthropicOAuth ? 'เชื่อมต่อด้วย OAuth (Claude Pro/Max)' : 'ใช้ API Key ธรรมดา'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          onClick={handleOAuthTest} disabled={oauthTesting}>
                          {oauthTesting ? 'กำลังทดสอบ...' : 'ทดสอบ'}
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          onClick={handleOAuthStart}>
                          เชื่อมต่อใหม่
                        </Button>
                        <Button size="sm" variant="outline"
                          className="text-xs h-7 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={handleAnthropicLogout}>
                          Logout
                        </Button>
                      </div>
                    </div>
                    {oauthTestResult === 'ok' && (
                      <p className="text-xs text-green-600 dark:text-green-400 px-1">✓ OAuth token ใช้งานได้ — พร้อมใช้งาน</p>
                    )}
                    {oauthTestResult === 'fail' && (
                      <p className="text-xs text-red-500 px-1">✗ Token ไม่ valid หรือหมดอายุ — กรุณากด Logout แล้วเชื่อมต่อใหม่</p>
                    )}
                  </div>
                )}

                {!isAnthropicConnected && oauthStep === 'idle' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-400 text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900"
                    onClick={handleOAuthStart}
                  >
                    เชื่อมต่อ Anthropic Account (OAuth)
                  </Button>
                )}

                {(oauthStep === 'waiting' || oauthStep === 'submitting') && (
                  <div className="space-y-3">
                    {/* Step 1 */}
                    <div className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">1</span>
                      <div className="flex-1 space-y-2">
                        <p className="text-xs font-medium">เปิด URL นี้แล้ว Login ด้วย Claude account</p>
                        <div className="flex gap-2">
                          <input readOnly value={oauthUrl} title="Anthropic OAuth URL"
                            className="flex-1 text-xs font-mono border rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 truncate" />
                          <Button size="sm" variant="outline" className="text-xs shrink-0"
                            onClick={() => window.open(oauthUrl, '_blank')}>เปิด</Button>
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">2</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium mb-1">หลัง Login เสร็จ — Copy URL ทั้งหมดจาก address bar</p>
                        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border px-3 py-2 text-xs text-zinc-500 space-y-1">
                          <p>Browser จะขึ้น <span className="text-red-500 font-medium">&quot;This site can&apos;t be reached&quot;</span>, <strong>ปกติ ไม่ต้องตกใจ</strong></p>
                          <p>URL ใน address bar จะมีหน้าตาแบบนี้:</p>
                          <p className="font-mono text-zinc-400 break-all text-xs bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1">
                            http://localhost:53692/callback?code=<span className="text-orange-500">XXXXX</span>&state=<span className="text-orange-500">XXXXX</span>
                          </p>
                          <p>→ <strong>Click address bar → Ctrl+A → Ctrl+C</strong> (Select All แล้ว Copy)</p>
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">3</span>
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs font-medium">วาง URL ที่ copy มา แล้วกด ยืนยัน</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={oauthRedirectUrl}
                            onChange={e => setOauthRedirectUrl(e.target.value)}
                            placeholder="http://localhost:53692/callback?code=...&state=..."
                            title="วาง redirect URL จาก browser address bar"
                            className="flex-1 text-xs font-mono border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-orange-400"
                          />
                          <Button size="sm"
                            className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                            disabled={!oauthRedirectUrl.trim() || oauthStep === 'submitting'}
                            onClick={handleOAuthSubmit}>
                            {oauthStep === 'submitting' ? 'กำลังเชื่อมต่อ...' : 'ยืนยัน'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {oauthError && <p className="text-xs text-red-500 pl-9">✗ {oauthError}</p>}
                    <button type="button" className="text-xs text-zinc-400 hover:text-zinc-600 underline pl-9"
                      onClick={() => { setOauthStep('idle'); setOauthUrl(''); setOauthRedirectUrl(''); setOauthError('') }}>
                      ยกเลิก
                    </button>
                  </div>
                )}

                {oauthStep === 'done' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 dark:text-green-400">✓ เชื่อมต่อ Anthropic Account สำเร็จ</span>
                    <button type="button" className="text-xs text-zinc-400 underline"
                      onClick={() => setOauthStep('idle')}>เชื่อมต่อใหม่</button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Anthropic OAuth note — model list now comes from live provider catalog */}
          {selectedProvider.id === 'anthropic' && isAnthropicOAuth && oauthStep === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Anthropic OAuth</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">Claude models are loaded from Anthropic&apos;s live model catalog.</p>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 space-y-1">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">ข้อมูลเกี่ยวกับค่าใช้จ่าย</p>
                  <p className="text-xs text-blue-600 dark:text-blue-300">
                    การใช้งานผ่าน OAuth ใช้ Usage Credits ใน claude.ai account ของคุณ ไม่ใช่ weekly session limit ที่เห็นในหน้าแชทปกติ
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-400">
                    ตรวจสอบและเติม credits ได้ที่{' '}
                    <a
                      href="https://claude.ai/settings/usage"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium hover:text-blue-700"
                    >
                      claude.ai/settings/usage
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommended (OpenRouter only) */}
          {selectedProvider.id === 'openrouter' && recommendedModels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">แนะนำสำหรับ ERP Chatbot ภาษาไทย</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">
                  Thai ดี + Tool Use จาก live catalog เท่านั้น
                  {staleRecommendedCount > 0 ? ` · ซ่อน ${staleRecommendedCount} รายการที่ไม่อยู่ใน catalog ตอนนี้` : ''}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recommendedModels.map(r => {
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedModelId(r.modelId)}
                        className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                          selectedModelId === r.modelId
                            ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                            : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
                        }`}
                      >
                        <span className="font-medium">{r.label}</span>
                        <span className="text-zinc-500 ml-2 text-xs">{r.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* คอลัมน์ขวา: เลือก Model */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {selectedProvider.noApiKey ? 'ขั้นตอนที่ 2' : 'ขั้นตอนที่ 3'} — เลือก Model
                  <span className="text-zinc-400 font-normal text-sm ml-2">({selectedProvider.label})</span>
                </CardTitle>
                {selectedProvider.id === 'openrouter' && (
                  <p className="text-xs text-zinc-500 mt-1">ราคาเป็น USD ต่อ 1 ล้าน token</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={refreshModels} disabled={modelsFetching}>
                <RefreshCw className={`h-4 w-4 ${modelsFetching ? 'animate-spin' : ''}`} />
                Refresh models
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className={`rounded-md border px-3 py-2.5 text-sm ${catalogStatusClass(modelCatalog?.status)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{catalogStatusText(modelCatalog?.status)}</span>
                {modelCatalog?.cache?.hit && <span className="text-xs">Using cache</span>}
              </div>
              <p className="mt-1 text-xs opacity-90">{catalogHelp(modelCatalog, selectedProvider)}</p>
              {modelCatalog?.warnings?.length ? (
                <div className="mt-2 space-y-1">
                  {modelCatalog.warnings.map(warning => (
                    <p key={warning} className="break-words text-xs opacity-90">{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Error state */}
            {modelsError && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>โหลด model catalog ไม่สำเร็จ — ตรวจสอบ API server แล้วลองใหม่</span>
              </div>
            )}

            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger
                role="combobox"
                aria-expanded={open}
                disabled={modelsLoading}
                onClick={() => setOpen(v => !v)}
                className="w-full inline-flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm font-normal shadow-sm hover:bg-accent disabled:opacity-50"
              >
                <span className="truncate">
                  {modelsLoading
                    ? 'กำลังโหลด models...'
                    : (selectedModelInfo?.name ?? (selectedModelId ? selectedModelId : 'เลือก Model...'))}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="ค้นหา model..." />
                  <CommandList>
                    <CommandEmpty>
                      {modelsError ? 'โหลดไม่สำเร็จ — ตรวจสอบ API Key' : 'ไม่พบ model ที่ค้นหา'}
                    </CommandEmpty>
                    {modelList.map(m => {
                      const isActive = selectedModelId === m.id
                      return (
                        <CommandItem
                          key={m.id}
                          value={`${m.name} ${m.id}`}
                          onSelect={() => { setSelectedModelId(m.id); setOpen(false) }}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Check className={`h-4 w-4 shrink-0 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="truncate">{m.name}</span>
                          </div>
                          {'pricing' in m && m.pricing && (
                            <span className="text-xs text-zinc-400 shrink-0">
                              {formatPrice(m.pricing.prompt)}
                            </span>
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Selected model info */}
            {selectedModelId && (
              <div className="rounded-md border px-3 py-2 text-xs text-zinc-500 space-y-1">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedModelInfo?.name ?? selectedModelId}
                </p>
                <p className="font-mono break-all text-zinc-400">{fullModel}</p>
                {selectedModelInfo && 'pricing' in selectedModelInfo && selectedModelInfo.pricing && (
                  <div className="flex gap-4 pt-1">
                    <span>Input: <strong className="text-zinc-600 dark:text-zinc-300">{formatPrice(selectedModelInfo.pricing.prompt)}</strong></span>
                    <span>Output: <strong className="text-zinc-600 dark:text-zinc-300">{formatPrice(selectedModelInfo.pricing.completion)}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Save buttons */}
            <div className="space-y-2 pt-1">
              {/* บันทึกทั้ง key + model */}
              {keyChanged && modelChanged && (
                <Button
                  className="w-full"
                  onClick={() => saveMutation.mutate({ saveKey: true, saveModel: true })}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก API Key + Model'}
                </Button>
              )}
              {/* บันทึก key อย่างเดียว */}
              {keyChanged && !modelChanged && (
                <Button
                  className="w-full"
                  onClick={() => saveMutation.mutate({ saveKey: true, saveModel: false })}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก API Key'}
                </Button>
              )}
              {/* บันทึก model อย่างเดียว */}
              {!keyChanged && modelChanged && (
                <Button
                  className="w-full"
                  onClick={() => saveMutation.mutate({ saveKey: false, saveModel: true })}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'กำลังบันทึก...' : `บันทึก Model — ${fullModel}`}
                </Button>
              )}
              {/* ไม่มีอะไรเปลี่ยน */}
              {!keyChanged && !modelChanged && (
                <Button className="w-full" disabled variant="outline">
                  {fullModel ? 'ไม่มีการเปลี่ยนแปลง' : 'เลือก Model ก่อน'}
                </Button>
              )}

              {/* Restart Gateway — แสดงหลังจาก save สำเร็จอย่างน้อย 1 ครั้ง */}
              {savedOnce && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => restartMutation.mutate()}
                  disabled={restartMutation.isPending}
                >
                  {restartMutation.isPending ? 'กำลัง Restart...' : '⚡ Restart Gateway เพื่อให้มีผล'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
