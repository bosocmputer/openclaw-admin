'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, putConfig, getModels, PROVIDERS, type ProviderConfig } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { toast } from 'sonner'
import { ChevronsUpDown, Check } from 'lucide-react'

// แยก provider prefix จาก model string เช่น "openrouter/qwen/qwen3.5-27b" → "openrouter"
function parseProviderFromModel(model: string): string {
  const p = PROVIDERS.find(pr => model.startsWith(pr.modelPrefix + '/'))
  return p?.id ?? 'openrouter'
}

// แยก model id จาก full string เช่น "openrouter/qwen/qwen3.5-27b" → "qwen/qwen3.5-27b"
function parseModelId(model: string, prefix: string): string {
  return model.startsWith(prefix + '/') ? model.slice(prefix.length + 1) : model
}

export default function ModelPage() {
  const qc = useQueryClient()
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig>(PROVIDERS[0])
  const [selectedModelId, setSelectedModelId] = useState('')  // id without prefix
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [testing, setTesting] = useState(false)
  // savedModelId = model ที่บันทึกไว้ใน config (id ไม่มี prefix) — ใช้ restore เมื่อ switch provider กลับ
  const savedProviderRef = useRef<string>('')
  const savedModelRef = useRef<string>('')

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: fetchedModels, isLoading: modelsLoading } = useQuery({
    queryKey: ['models', selectedProvider.id],
    queryFn: () => getModels(selectedProvider.id),
    enabled: !!config,
    staleTime: 5 * 60 * 1000,
  })

  // โหลด current model + api key จาก config
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

  // เมื่อ user เปลี่ยน provider — โหลด key, restore model ถ้าเป็น provider ที่บันทึกไว้
  useEffect(() => {
    if (!config) return
    setApiKey(config.env?.[selectedProvider.envKey] ?? '')
    setTestResult('idle')
    if (selectedProvider.id === savedProviderRef.current) {
      setSelectedModelId(savedModelRef.current)
    } else {
      setSelectedModelId('')
    }
  }, [selectedProvider]) // eslint-disable-line react-hooks/exhaustive-deps

  const fullModel = selectedModelId ? `${selectedProvider.modelPrefix}/${selectedModelId}` : ''
  const current = config?.agents?.defaults?.model?.primary ?? '-'

  // model list สำหรับ provider ปัจจุบัน — โหลดจาก API จริงทุก provider
  const modelList: { id: string; name: string; pricing?: { prompt: string; completion: string } }[] =
    fetchedModels ?? []

  const selectedModelInfo = modelList.find(m => m.id === selectedModelId)

  function formatPrice(val: string) {
    const n = parseFloat(val)
    if (isNaN(n) || n === 0) return 'ฟรี'
    return `$${(n * 1_000_000).toFixed(2)}/1M`
  }

  async function testApiKey() {
    setTesting(true); setTestResult('idle')
    try {
      const { testUrl, authHeader, extraHeaders } = selectedProvider
      if (!testUrl) { setTestResult('ok'); setTesting(false); return }

      const headers: Record<string, string> = { ...(extraHeaders ?? {}) }
      if (authHeader === 'x-api-key') headers['x-api-key'] = apiKey.trim()
      else headers['Authorization'] = `Bearer ${apiKey.trim()}`

      // Google ใช้ query param แทน header
      const url = selectedProvider.id === 'google'
        ? `${testUrl}?key=${apiKey.trim()}`
        : testUrl

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      setTestResult(res.ok ? 'ok' : 'fail')
    } catch { setTestResult('fail') }
    finally { setTesting(false) }
  }

  const saveApiKey = useMutation({
    mutationFn: async () => {
      if (!config) return
      await putConfig({
        ...config,
        env: { ...config.env, [selectedProvider.envKey]: apiKey.trim() },
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); toast.success('API Key saved') },
    onError: () => toast.error('Failed to save API Key'),
  })

  const saveModel = useMutation({
    mutationFn: async () => {
      if (!config || !fullModel) return
      await putConfig({
        ...config,
        agents: {
          ...config.agents,
          defaults: { ...config.agents?.defaults, model: { primary: fullModel } },
        },
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); toast.success('Model saved') },
    onError: () => toast.error('Failed to save model'),
  })

  const RECOMMENDED = [
    { id: 'openrouter/openrouter/free', label: 'ฟรี', desc: 'OpenRouter Free — ทดสอบ' },
    { id: 'openrouter/qwen/qwen3.5-flash-02-23', label: 'ประหยัดสุด', desc: 'Qwen 3.5 Flash — Thai ดี, ราคาถูก' },
    { id: 'openrouter/qwen/qwen3.5-27b', label: 'แนะนำ ⭐', desc: 'Qwen 3.5 27B — สมดุลราคา/ประสิทธิภาพ' },
    { id: 'openrouter/qwen/qwen3.5-122b-a10b', label: 'ดีที่สุด', desc: 'Qwen 3.5 122B — ประสิทธิภาพสูงสุด' },
  ]

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Model</h1>
        <p className="text-sm text-zinc-500 mt-1">เลือก AI model ค่าเริ่มต้นสำหรับทุก agent — เปลี่ยนแล้วต้อง restart gateway เพื่อให้มีผล</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* คอลัมน์ซ้าย */}
        <div className="space-y-6">

          {/* Provider selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Provider</CardTitle>
              <p className="text-xs text-zinc-500 mt-1">เลือก provider ที่ต้องการใช้</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
            </CardContent>
          </Card>

          {/* API Key */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selectedProvider.label} API Key</CardTitle>
              <p className="text-xs text-zinc-500 mt-1 font-mono">{selectedProvider.envKey}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestResult('idle') }}
                  placeholder="API Key..."
                  className="font-mono"
                />
                <Button variant="outline" size="sm" onClick={() => setShowKey(v => !v)}>
                  {showKey ? 'Hide' : 'Show'}
                </Button>
                <Button variant="outline" size="sm" onClick={testApiKey} disabled={testing || !apiKey.trim()}>
                  {testing ? '...' : 'Test'}
                </Button>
                <Button onClick={() => saveApiKey.mutate()} disabled={saveApiKey.isPending || !apiKey.trim()}>
                  {saveApiKey.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
              {testResult === 'ok' && <p className="text-xs text-green-600 dark:text-green-400">✓ API Key ใช้งานได้</p>}
              {testResult === 'fail' && <p className="text-xs text-red-500">✗ API Key ไม่ถูกต้องหรือเชื่อมต่อไม่ได้</p>}
            </CardContent>
          </Card>

          {/* Current model */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-500">Model ที่ใช้อยู่ตอนนี้</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm break-all">{current}</p>
            </CardContent>
          </Card>

          {/* Recommended (OpenRouter only) */}
          {selectedProvider.id === 'openrouter' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">แนะนำสำหรับ ERP Chatbot ภาษาไทย</CardTitle>
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

        {/* คอลัมน์ขวา */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เลือก Model — {selectedProvider.label}</CardTitle>
            {selectedProvider.id === 'openrouter' && (
              <p className="text-xs text-zinc-500 mt-1">ราคาเป็น USD ต่อ 1 ล้าน token</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
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
                    ? 'Loading models...'
                    : (selectedModelInfo?.name ?? selectedModelId ?? 'เลือก Model...')}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="ค้นหา model..." />
                  <CommandList>
                    <CommandEmpty>ไม่พบ model ที่ค้นหา</CommandEmpty>
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

            <Button
              className="w-full"
              onClick={() => saveModel.mutate()}
              disabled={saveModel.isPending || !fullModel}
            >
              {saveModel.isPending ? 'Saving...' : `Save — ${fullModel || 'เลือก model ก่อน'}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
