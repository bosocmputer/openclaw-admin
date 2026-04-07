'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface MemoryAgentStatus {
  agentId: string
  workspace: string
  memory: { exists: boolean; sizeChars: number; preview: string }
  dreams: { exists: boolean; sizeChars: number; preview: string }
  dreaming: { enabled: boolean; config: Record<string, unknown> | null }
}

async function fetchMemoryStatus(): Promise<MemoryAgentStatus[]> {
  const { data } = await api.get('/api/memory/status')
  return data
}

async function fetchMemoryContent(agentId: string, type: 'memory' | 'dreams'): Promise<string> {
  const { data } = await api.get(`/api/memory/${agentId}/${type === 'memory' ? 'memory' : 'dreams'}`)
  return data.content ?? ''
}

function formatChars(n: number) {
  if (n > 1000) return `${(n / 1000).toFixed(1)}k chars`
  return `${n} chars`
}

export default function MemoryPage() {
  const [viewDialog, setViewDialog] = useState<{ agentId: string; type: 'memory' | 'dreams'; title: string } | null>(null)
  const [viewContent, setViewContent] = useState('')
  const [viewLoading, setViewLoading] = useState(false)

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['memory-status'],
    queryFn: fetchMemoryStatus,
    refetchInterval: 30000,
  })

  async function openView(agentId: string, type: 'memory' | 'dreams', title: string) {
    setViewDialog({ agentId, type, title })
    setViewLoading(true)
    try {
      const content = await fetchMemoryContent(agentId, type)
      setViewContent(content)
    } catch {
      setViewContent('โหลดไม่สำเร็จ')
    } finally {
      setViewLoading(false)
    }
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Memory</h1>
        <p className="text-sm text-zinc-500 mt-1">
          สถานะ MEMORY.md และ Dreams ของแต่ละ agent — อัปเดตทุก 30 วินาที
        </p>
      </div>

      {isLoading && <p className="text-sm text-zinc-400">กำลังโหลด...</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map(agent => (
          <Card key={agent.agentId}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-mono">{agent.agentId}</CardTitle>
                <Badge variant={agent.dreaming.enabled ? 'default' : 'secondary'} className="text-xs">
                  dreaming {agent.dreaming.enabled ? 'on' : 'off'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 font-mono">{agent.workspace}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* MEMORY.md */}
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">MEMORY.md</span>
                    <Badge variant={agent.memory.exists ? 'outline' : 'secondary'} className="text-xs">
                      {agent.memory.exists ? formatChars(agent.memory.sizeChars) : 'ไม่มีไฟล์'}
                    </Badge>
                  </div>
                  {agent.memory.exists && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-6 px-2"
                      onClick={() => openView(agent.agentId, 'memory', `${agent.agentId} — MEMORY.md`)}
                    >
                      ดู
                    </Button>
                  )}
                </div>
                {agent.memory.preview && (
                  <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap line-clamp-3">
                    {agent.memory.preview}
                  </pre>
                )}
              </div>

              {/* dreams.md */}
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">dreams.md</span>
                    <Badge variant={agent.dreams.exists ? 'outline' : 'secondary'} className="text-xs">
                      {agent.dreams.exists ? formatChars(agent.dreams.sizeChars) : 'ไม่มีไฟล์'}
                    </Badge>
                  </div>
                  {agent.dreams.exists && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-6 px-2"
                      onClick={() => openView(agent.agentId, 'dreams', `${agent.agentId} — dreams.md`)}
                    >
                      ดู
                    </Button>
                  )}
                </div>
                {agent.dreams.preview && (
                  <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap line-clamp-2">
                    {agent.dreams.preview}
                  </pre>
                )}
              </div>
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
