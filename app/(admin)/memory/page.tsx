'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface DailyMemory {
  fileCount: number
  totalChars: number
  latestDate: string | null
  latestPreview: string
  files: string[]
}

interface MemoryAgentStatus {
  agentId: string
  workspace: string
  memory: { exists: boolean; sizeChars: number; preview: string }
  dreams: { exists: boolean; sizeChars: number; preview: string }
  dailyMemory: DailyMemory
  dreaming: { enabled: boolean; config: Record<string, unknown> | null }
}

async function fetchMemoryStatus(): Promise<MemoryAgentStatus[]> {
  const { data } = await api.get('/api/memory/status')
  return data
}

async function fetchMemoryContent(agentId: string, type: 'memory' | 'dreams'): Promise<string> {
  const { data } = await api.get(`/api/memory/${agentId}/${type}`)
  return data.content ?? ''
}

async function fetchDailyContent(agentId: string, filename: string): Promise<string> {
  const { data } = await api.get(`/api/memory/${agentId}/daily/${filename}`)
  return data.content ?? ''
}

function formatChars(n: number) {
  if (n > 1000) return `${(n / 1000).toFixed(1)}k ตัวอักษร`
  return `${n} ตัวอักษร`
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  // e.g. "2026-04-02-cement-inquiry" → show as-is, or "2026-04-02" → show date
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return dateStr
  return `${match[3]}/${match[2]}/${match[1]}`
}

export default function MemoryPage() {
  const [viewDialog, setViewDialog] = useState<{ title: string } | null>(null)
  const [viewContent, setViewContent] = useState('')
  const [viewLoading, setViewLoading] = useState(false)
  const [expandedDailyAgent, setExpandedDailyAgent] = useState<string | null>(null)

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['memory-status'],
    queryFn: fetchMemoryStatus,
    refetchInterval: 30000,
  })

  async function openView(title: string, loader: () => Promise<string>) {
    setViewDialog({ title })
    setViewLoading(true)
    setViewContent('')
    try {
      const content = await loader()
      setViewContent(content)
    } catch {
      setViewContent('โหลดไม่สำเร็จ')
    } finally {
      setViewLoading(false)
    }
  }

  const anyDreamingEnabled = agents.some(a => a.dreaming.enabled)
  const anyActivityExists = agents.some(a => a.memory.exists || a.dreams.exists || a.dailyMemory.fileCount > 0)

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Memory</h1>
        <p className="text-sm text-zinc-500 mt-1">
          ความจำระยะยาวของ AI Agent — ข้อมูลที่ AI บันทึกไว้เพื่อใช้ในการสนทนาครั้งถัดไป
        </p>
      </div>

      {/* Explainer */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 p-4 space-y-4">
        <div>
          <p className="font-semibold text-sm text-violet-800 dark:text-violet-200">Memory ทำงานอย่างไร?</p>
          <p className="text-sm text-violet-700 dark:text-violet-300 mt-1">
            ปกติ AI จะ "ลืม" ทุกอย่างเมื่อ session จบหรือถูก compaction
            Memory คือระบบให้ AI บันทึกข้อมูลสำคัญลงไฟล์ เพื่อจำไว้ใช้ในครั้งถัดไป
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-md bg-white dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 p-3 space-y-1">
            <p className="font-semibold text-violet-700 dark:text-violet-300">📅 memory/YYYY-MM-DD.md</p>
            <p className="text-violet-600 dark:text-violet-400">บันทึกรายวัน — AI จด log การสนทนาแต่ละวัน</p>
            <p className="text-zinc-500 dark:text-zinc-400 italic">นี่คือหลักฐานว่า AI ทำงานจริง</p>
          </div>
          <div className="rounded-md bg-white dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 p-3 space-y-1">
            <p className="font-semibold text-violet-700 dark:text-violet-300">🧠 MEMORY.md</p>
            <p className="text-violet-600 dark:text-violet-400">ความจำระยะยาว — AI คัดสรุปสิ่งสำคัญไว้ (main session เท่านั้น)</p>
            <p className="text-zinc-500 dark:text-zinc-400 italic">เช่น: ข้อมูลสำคัญที่ควรจำตลอดไป</p>
          </div>
          <div className="rounded-md bg-white dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 p-3 space-y-1">
            <p className="font-semibold text-violet-700 dark:text-violet-300">💤 Dreams.md</p>
            <p className="text-violet-600 dark:text-violet-400">AI สรุปบทเรียนช่วง off-peak อัตโนมัติ</p>
            <p className="text-zinc-500 dark:text-zinc-400 italic">เช่น: สินค้าที่ถูกถามบ่อยที่สุด</p>
          </div>
        </div>

        {!anyDreamingEnabled && (
          <div className="border-t border-violet-200 dark:border-violet-800 pt-3 flex items-start gap-2">
            <span className="text-amber-500 text-sm shrink-0">⚠️</span>
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">ยังไม่ได้เปิดใช้งาน Dreaming</p>
              <p className="text-amber-600 dark:text-amber-500 text-xs mt-0.5">
                เปิดใช้งานได้ที่หน้า{' '}
                <Link href="/compaction" className="underline font-medium">Compaction</Link>
                {' '}→ ส่วน Memory / Dreaming
              </p>
            </div>
          </div>
        )}

        {anyDreamingEnabled && !anyActivityExists && (
          <div className="border-t border-violet-200 dark:border-violet-800 pt-3 flex items-start gap-2">
            <span className="text-blue-500 text-sm shrink-0">ℹ️</span>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Dreaming เปิดอยู่แล้ว — Memory จะสร้างหลังจาก AI เริ่มมีการสนทนา
            </p>
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-zinc-400">กำลังโหลด...</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map(agent => (
          <Card key={agent.agentId}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-mono">{agent.agentId}</CardTitle>
                <Badge
                  variant={agent.dreaming.enabled ? 'default' : 'secondary'}
                  className={`text-xs ${agent.dreaming.enabled ? 'bg-violet-600' : ''}`}
                >
                  {agent.dreaming.enabled ? '💤 Dreaming เปิด' : 'Dreaming ปิด'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 font-mono">{agent.workspace}</p>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Daily Memory — primary system */}
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📅</span>
                    <span className="text-sm font-medium">บันทึกรายวัน</span>
                    <Badge variant={agent.dailyMemory.fileCount > 0 ? 'outline' : 'secondary'} className="text-xs">
                      {agent.dailyMemory.fileCount > 0
                        ? `${agent.dailyMemory.fileCount} ไฟล์ · ${formatChars(agent.dailyMemory.totalChars)}`
                        : 'ยังว่าง'}
                    </Badge>
                  </div>
                  {agent.dailyMemory.fileCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-6 px-2"
                      onClick={() => setExpandedDailyAgent(
                        expandedDailyAgent === agent.agentId ? null : agent.agentId
                      )}
                    >
                      {expandedDailyAgent === agent.agentId ? 'ซ่อน' : 'ดูทั้งหมด'}
                    </Button>
                  )}
                </div>

                {agent.dailyMemory.latestPreview ? (
                  <pre className="text-xs text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap line-clamp-3 bg-white dark:bg-zinc-800/50 rounded p-2">
                    {agent.dailyMemory.latestPreview}
                  </pre>
                ) : (
                  <p className="text-xs text-zinc-400 italic">
                    AI ยังไม่ได้บันทึกอะไร — จะสร้างหลังจากมีการสนทนา
                  </p>
                )}

                {/* File list */}
                {expandedDailyAgent === agent.agentId && agent.dailyMemory.files.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-emerald-200 dark:border-emerald-800">
                    {agent.dailyMemory.files.map(f => (
                      <div key={f} className="flex items-center justify-between">
                        <span className="text-xs font-mono text-zinc-500">{f}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-5 px-2 text-violet-600"
                          onClick={() => openView(
                            `${agent.agentId} — ${f}`,
                            () => fetchDailyContent(agent.agentId, f)
                          )}
                        >
                          อ่าน
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MEMORY.md */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🧠</span>
                    <span className="text-sm font-medium">MEMORY.md</span>
                    <Badge variant={agent.memory.exists ? 'outline' : 'secondary'} className="text-xs">
                      {agent.memory.exists ? formatChars(agent.memory.sizeChars) : 'ยังว่าง'}
                    </Badge>
                  </div>
                  {agent.memory.exists && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-6 px-2"
                      onClick={() => openView(
                        `${agent.agentId} — MEMORY.md`,
                        () => fetchMemoryContent(agent.agentId, 'memory')
                      )}
                    >
                      อ่าน
                    </Button>
                  )}
                </div>
                {agent.memory.exists && agent.memory.preview ? (
                  <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap line-clamp-3 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2">
                    {agent.memory.preview}
                  </pre>
                ) : (
                  <p className="text-xs text-zinc-400 italic">
                    AI จะสร้างไฟล์นี้เมื่อต้องการจำข้อมูลระยะยาว (main session)
                  </p>
                )}
              </div>

              {/* Dreams.md */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💤</span>
                    <span className="text-sm font-medium">Dreams.md</span>
                    <Badge variant={agent.dreams.exists ? 'outline' : 'secondary'} className="text-xs">
                      {agent.dreams.exists ? formatChars(agent.dreams.sizeChars) : 'ยังว่าง'}
                    </Badge>
                  </div>
                  {agent.dreams.exists && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-6 px-2"
                      onClick={() => openView(
                        `${agent.agentId} — Dreams.md`,
                        () => fetchMemoryContent(agent.agentId, 'dreams')
                      )}
                    >
                      อ่าน
                    </Button>
                  )}
                </div>
                {agent.dreams.exists && agent.dreams.preview ? (
                  <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap line-clamp-2 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2">
                    {agent.dreams.preview}
                  </pre>
                ) : (
                  <p className="text-xs text-zinc-400 italic">
                    {agent.dreaming.enabled
                      ? 'AI จะสร้างไฟล์นี้หลังจาก dreaming phase ทำงาน'
                      : 'ต้องเปิด Dreaming ก่อน'}
                  </p>
                )}
              </div>

              {!agent.dreaming.enabled && (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-center">
                  <p className="text-xs text-zinc-400">
                    เปิด Dreaming ได้ที่{' '}
                    <Link href="/compaction" className="text-violet-500 hover:underline font-medium">
                      หน้า Compaction
                    </Link>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={v => !v && setViewDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{viewDialog?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {viewLoading ? (
              <p className="text-sm text-zinc-400 py-4 text-center">กำลังโหลด...</p>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 p-1">
                {viewContent || '(ไฟล์ว่างเปล่า)'}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
