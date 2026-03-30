'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, putConfig, getModels, testProvider, restartGateway, PROVIDERS, type ProviderConfig } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { toast } from 'sonner'
import { ChevronsUpDown, Check, AlertCircle } from 'lucide-react'

function parseProviderFromModel(model: string): string {
  const p = PROVIDERS.find(pr => model.startsWith(pr.modelPrefix + '/'))
  return p?.id ?? 'openrouter'
}

function parseModelId(model: string, prefix: string): string {
  return model.startsWith(prefix + '/') ? model.slice(prefix.length + 1) : model
}

function formatPrice(val: string) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return 'ฟรี'
  return `$${(n * 1_000_000).toFixed(2)}/1M`
}

const RECOMMENDED = [
  { id: 'openrouter/openrouter/free',             label: 'ฟรี',         desc: 'OpenRouter Free — ทดสอบ' },
  { id: 'openrouter/qwen/qwen3.5-flash-02-23',    label: 'ประหยัดสุด',  desc: 'Qwen 3.5 Flash — Thai ดี, ราคาถูก' },
  { id: 'openrouter/qwen/qwen3.5-27b',            label: 'แนะนำ ⭐',    desc: 'Qwen 3.5 27B — สมดุลราคา/ประสิทธิภาพ' },
  { id: 'openrouter/qwen/qwen3.5-122b-a10b',      label: 'ดีที่สุด',    desc: 'Qwen 3.5 122B — ประสิทธิภาพสูงสุด' },
]

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

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: fetchedModels, isLoading: modelsLoading, isError: modelsError } = useQuery({
    queryKey: ['models', selectedProvider.id],
    queryFn: () => getModels(selectedProvider.id),
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

  const fullModel = selectedModelId ? `${selectedProvider.modelPrefix}/${selectedModelId}` : ''
  const currentModel = config?.agents?.defaults?.model?.primary ?? '-'
  const modelList: { id: string; name: string; pricing?: { prompt: string; completion: string } }[] = fetchedModels ?? []
  const selectedModelInfo = modelList.find(m => m.id === selectedModelId)

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
      if (saveKey && !selectedProvider.noApiKey) {
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
  const keyChanged = !selectedProvider.noApiKey && apiKey.trim() !== currentKeyInConfig
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

          {/* ขั้นตอน 2: API Key (ซ่อนถ้าไม่ต้องการ key) */}
          {!selectedProvider.noApiKey && (
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

          {/* Recommended (OpenRouter only) */}
          {selectedProvider.id === 'openrouter' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">แนะนำสำหรับ ERP Chatbot ภาษาไทย</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">Thai ดี + Tool Use — คลิกเพื่อเลือก</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {RECOMMENDED.map(r => {
                    const rModelId = parseModelId(r.id, 'openrouter')
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedModelId(rModelId)}
                        className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                          selectedModelId === rModelId
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
            <CardTitle className="text-base">
              {selectedProvider.noApiKey ? 'ขั้นตอนที่ 2' : 'ขั้นตอนที่ 3'} — เลือก Model
              <span className="text-zinc-400 font-normal text-sm ml-2">({selectedProvider.label})</span>
            </CardTitle>
            {selectedProvider.id === 'openrouter' && (
              <p className="text-xs text-zinc-500 mt-1">ราคาเป็น USD ต่อ 1 ล้าน token</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Error state */}
            {modelsError && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>โหลด model list ไม่สำเร็จ — ตรวจสอบ API Key แล้วลองใหม่</span>
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
