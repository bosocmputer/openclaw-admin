'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, putConfig, restartGateway } from '@/lib/api'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface CompactionForm {
  mode: 'safeguard' | 'default' | 'off'
  maxHistoryShare: number       // 0.1–0.9
  keepRecentTokens: number      // token ที่เก็บหลัง compact
  recentTurnsPreserve: number   // turn ล่าสุดที่ไม่ compress (0–12)
  softThresholdTokens: number   // เริ่ม compact เมื่อเกินค่านี้ (0 = ปิด)
}

const DEFAULTS: CompactionForm = {
  mode: 'safeguard',
  maxHistoryShare: 0.5,
  keepRecentTokens: 10000,
  recentTurnsPreserve: 3,
  softThresholdTokens: 0,
}

export default function CompactionPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<CompactionForm>(DEFAULTS)
  const [savedOnce, setSavedOnce] = useState(false)

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  // โหลด config ที่มีอยู่
  useEffect(() => {
    if (!config) return
    const c = config.agents?.defaults?.compaction
    if (!c) return
    setForm({
      mode: (c.mode as CompactionForm['mode']) ?? 'safeguard',
      maxHistoryShare: typeof c.maxHistoryShare === 'number' ? c.maxHistoryShare : 0.5,
      keepRecentTokens: typeof c.keepRecentTokens === 'number' ? c.keepRecentTokens : 10000,
      recentTurnsPreserve: typeof c.recentTurnsPreserve === 'number' ? c.recentTurnsPreserve : 3,
      softThresholdTokens: c.memoryFlush?.softThresholdTokens ?? 0,
    })
  }, [config])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!config) return
      const compaction: Record<string, unknown> = {
        mode: form.mode === 'off' ? undefined : form.mode,
        maxHistoryShare: form.maxHistoryShare,
        keepRecentTokens: form.keepRecentTokens,
        recentTurnsPreserve: form.recentTurnsPreserve,
      }
      if (form.softThresholdTokens > 0) {
        compaction.memoryFlush = { softThresholdTokens: form.softThresholdTokens }
      }
      // ลบ key ที่เป็น undefined ออก
      Object.keys(compaction).forEach(k => compaction[k] === undefined && delete compaction[k])

      const updated = {
        ...config,
        agents: {
          ...config.agents,
          defaults: {
            ...config.agents?.defaults,
            compaction: form.mode === 'off' ? undefined : compaction,
          },
        },
      }
      await putConfig(updated)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setSavedOnce(true)
      toast.success('บันทึก Compaction Settings แล้ว')
    },
    onError: () => toast.error('บันทึกไม่สำเร็จ'),
  })

  const restartMutation = useMutation({
    mutationFn: restartGateway,
    onSuccess: () => toast.success('Restart Gateway สำเร็จ'),
    onError: () => toast.error('Restart Gateway ไม่สำเร็จ'),
  })

  const currentMode = (config?.agents?.defaults as Record<string, unknown> | undefined)
    ?.compaction ? ((config?.agents?.defaults as Record<string, unknown>)?.compaction as Record<string, unknown>)?.mode ?? 'safeguard' : 'safeguard'

  return (
    <div className="space-y-6 w-full max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Compaction</h1>
        <p className="text-sm text-zinc-500 mt-1">
          ตั้งค่าการบีบอัด context อัตโนมัติ — ลด token ที่ใช้ต่อ session โดยไม่สูญเสียความต่อเนื่องของการสนทนา
        </p>
      </div>

      {/* ── คำอธิบาย ── */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-sm text-blue-700 dark:text-blue-400">Compaction คืออะไร?</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-blue-700 dark:text-blue-400 space-y-2">
          <p>
            ทุก turn ที่ bot คุยกับ user ประวัติการสนทนาจะถูกส่งไป AI ซ้ำทุกครั้ง ยิ่งคุยนาน token ยิ่งพุ่งสูง
          </p>
          <p>
            Compaction แก้ปัญหานี้โดย <strong>สรุปประวัติเก่า</strong>ให้เหลือสั้นลง เมื่อ context ใกล้เต็ม
            AI จะยังจำ <em>สาระสำคัญ</em>ของการสนทนาได้ แต่ใช้ token น้อยลงมาก
          </p>
          <p className="font-medium">ตัวอย่าง: session 50 turns (80k token) → compact → เหลือ ~10k token</p>
        </CardContent>
      </Card>

      {/* ── Mode ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">โหมด Compaction</CardTitle>
          <p className="text-xs text-zinc-500 mt-1">
            ใช้อยู่ตอนนี้: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{String(currentMode)}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            {
              value: 'safeguard',
              label: 'Safeguard (แนะนำ)',
              desc: 'compact อัตโนมัติเมื่อ context ใกล้เต็ม — ประหยัด token มากที่สุด ปลอดภัยที่สุด',
            },
            {
              value: 'default',
              label: 'Default',
              desc: 'ใช้พฤติกรรม compact แบบพื้นฐานของ OpenClaw SDK',
            },
            {
              value: 'off',
              label: 'ปิด (ไม่แนะนำ)',
              desc: 'ไม่ compress context เลย — token จะเพิ่มขึ้นเรื่อยๆ ตลอด session',
            },
          ] as { value: CompactionForm['mode']; label: string; desc: string }[]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, mode: opt.value }))}
              className={`w-full text-left px-4 py-3 rounded-md border text-sm transition-colors ${
                form.mode === opt.value
                  ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                  : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
              }`}
            >
              <p className="font-medium">{opt.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* ── Parameters (ซ่อนถ้าปิด) ── */}
      {form.mode !== 'off' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ปรับพารามิเตอร์</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">ปรับละเอียดตามความต้องการ — ใช้ค่า default ก็ได้ถ้าไม่แน่ใจ</p>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* maxHistoryShare */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Max History Share</label>
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
                  {Math.round(form.maxHistoryShare * 100)}%
                </span>
              </div>
              <input
                type="range"
                title="Max History Share"
                min={10} max={90} step={5}
                value={Math.round(form.maxHistoryShare * 100)}
                onChange={e => setForm(f => ({ ...f, maxHistoryShare: Number(e.target.value) / 100 }))}
                className="w-full accent-zinc-900 dark:accent-white"
              />
              <div className="flex justify-between text-xs text-zinc-400">
                <span>10% (compact บ่อย)</span>
                <span>90% (compact น้อย)</span>
              </div>
              <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded px-3 py-2">
                <strong>ความหมาย:</strong> history จะถูก compact เมื่อใช้ context เกิน {Math.round(form.maxHistoryShare * 100)}%
                ของ context window ทั้งหมด — ค่าต่ำ = compact บ่อย ใช้ token น้อย, ค่าสูง = compact นานๆ ครั้ง
              </p>
            </div>

            {/* keepRecentTokens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Keep Recent Tokens</label>
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
                  {form.keepRecentTokens.toLocaleString()} tokens
                </span>
              </div>
              <Input
                type="number"
                min={1000}
                max={50000}
                step={1000}
                value={form.keepRecentTokens}
                onChange={e => setForm(f => ({ ...f, keepRecentTokens: Number(e.target.value) }))}
                className="font-mono"
              />
              <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded px-3 py-2">
                <strong>ความหมาย:</strong> หลัง compact จะ keep history ไว้ {form.keepRecentTokens.toLocaleString()} token
                ล่าสุด — ค่าสูง = AI จำได้มากขึ้น แต่ใช้ token มากขึ้น แนะนำ 5,000–15,000
              </p>
            </div>

            {/* recentTurnsPreserve */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Recent Turns Preserve</label>
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
                  {form.recentTurnsPreserve} turns
                </span>
              </div>
              <input
                type="range"
                title="Recent Turns Preserve"
                min={0} max={12} step={1}
                value={form.recentTurnsPreserve}
                onChange={e => setForm(f => ({ ...f, recentTurnsPreserve: Number(e.target.value) }))}
                className="w-full accent-zinc-900 dark:accent-white"
              />
              <div className="flex justify-between text-xs text-zinc-400">
                <span>0 (compress ทั้งหมด)</span>
                <span>12 turns</span>
              </div>
              <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded px-3 py-2">
                <strong>ความหมาย:</strong> {form.recentTurnsPreserve} turn ล่าสุดจะไม่ถูก compress ไว้เต็มๆ
                — ช่วยให้ AI ยังจำบริบทล่าสุดได้ชัดเจน แนะนำ 2–5
              </p>
            </div>

            {/* softThresholdTokens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Soft Threshold Tokens <span className="text-zinc-400 font-normal">(ไม่บังคับ)</span></label>
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
                  {form.softThresholdTokens > 0 ? form.softThresholdTokens.toLocaleString() : 'ปิด'}
                </span>
              </div>
              <Input
                type="number"
                min={0}
                max={200000}
                step={5000}
                value={form.softThresholdTokens}
                onChange={e => setForm(f => ({ ...f, softThresholdTokens: Number(e.target.value) }))}
                placeholder="0 = ปิด"
                className="font-mono"
              />
              <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded px-3 py-2">
                <strong>ความหมาย:</strong> เริ่ม compact ทันทีเมื่อ session ใช้ token เกินค่านี้
                — ใช้ร่วมกับ maxHistoryShare ได้ ใส่ 0 เพื่อปิดการทำงานของ parameter นี้
              </p>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Summary ── */}
      {form.mode !== 'off' && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">สรุปการตั้งค่า</p>
            <ul className="text-xs text-green-700 dark:text-green-400 space-y-1 list-disc list-inside">
              <li>โหมด: <strong>{form.mode}</strong></li>
              <li>compact เมื่อ history เกิน <strong>{Math.round(form.maxHistoryShare * 100)}%</strong> ของ context window</li>
              <li>หลัง compact เก็บ <strong>{form.keepRecentTokens.toLocaleString()} token</strong> ล่าสุด</li>
              <li>ไม่ compress <strong>{form.recentTurnsPreserve} turn</strong> ล่าสุด</li>
              {form.softThresholdTokens > 0 && (
                <li>compact ทันทีเมื่อเกิน <strong>{form.softThresholdTokens.toLocaleString()} token</strong></li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Actions ── */}
      <div className="space-y-2">
        <Button
          className="w-full"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก Compaction Settings'}
        </Button>
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
        <p className="text-xs text-zinc-400 text-center">หลังบันทึกต้อง Restart Gateway เพื่อให้ config มีผล</p>
      </div>
    </div>
  )
}
