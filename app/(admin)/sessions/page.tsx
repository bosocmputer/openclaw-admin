'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getAgents } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Checkpoint {
  filename: string
  sessionId: string
  checkpointAt: string
  sizeBytes: number
}

async function fetchCheckpoints(agentId: string): Promise<Checkpoint[]> {
  const { data } = await api.get(`/api/compaction/checkpoints/${agentId}`)
  return data
}

function formatBytes(b: number) {
  if (b > 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

function formatTs(ts: string) {
  try { return new Date(ts).toLocaleString('th-TH') } catch { return ts }
}

export default function SessionsPage() {
  const qc = useQueryClient()
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [restoreTarget, setRestoreTarget] = useState<Checkpoint | null>(null)

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })

  const { data: checkpoints = [], isLoading } = useQuery({
    queryKey: ['checkpoints', selectedAgent],
    queryFn: () => fetchCheckpoints(selectedAgent),
    enabled: !!selectedAgent,
  })

  const restore = useMutation({
    mutationFn: ({ agentId, filename }: { agentId: string; filename: string }) =>
      api.post('/api/compaction/restore', { agentId, filename }),
    onSuccess: (_, { filename }) => {
      toast.success(`Restore สำเร็จจาก ${filename} — session ถูก restore แล้ว`)
      qc.invalidateQueries({ queryKey: ['checkpoints', selectedAgent] })
      setRestoreTarget(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Restore ไม่สำเร็จ'),
  })

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Session Checkpoints</h1>
        <p className="text-sm text-zinc-500 mt-1">
          ดูและ restore session จาก compaction checkpoints — ป้องกันการสูญหายของ context หลัง compaction
        </p>
      </div>

      {/* Agent selector */}
      <div className="flex gap-2 flex-wrap">
        {agents.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => setSelectedAgent(a.id)}
            className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
              selectedAgent === a.id
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
            }`}
          >
            {a.id}
          </button>
        ))}
      </div>

      {!selectedAgent && (
        <p className="text-sm text-zinc-400">เลือก Agent ด้านบนเพื่อดู checkpoints</p>
      )}

      {selectedAgent && isLoading && (
        <p className="text-sm text-zinc-400">กำลังโหลด...</p>
      )}

      {selectedAgent && !isLoading && checkpoints.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-zinc-400 text-sm">
            ไม่มี checkpoint สำหรับ agent <span className="font-mono font-medium">{selectedAgent}</span>
            <br />
            <span className="text-xs">checkpoint จะถูกสร้างอัตโนมัติเมื่อ gateway ทำ compaction</span>
          </CardContent>
        </Card>
      )}

      {selectedAgent && checkpoints.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">{checkpoints.length} checkpoints</p>
          {checkpoints.map(cp => (
            <Card key={cp.filename}>
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate text-zinc-700 dark:text-zinc-300">{cp.sessionId}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      checkpoint เมื่อ {formatTs(cp.checkpointAt)} · {formatBytes(cp.sizeBytes)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                    onClick={() => setRestoreTarget(cp)}
                  >
                    Restore
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono text-zinc-400 truncate">{cp.filename}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Restore Dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={v => !v && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Session Checkpoint</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>ต้องการ restore session <span className="font-mono font-medium">{restoreTarget?.sessionId}</span> กลับไปที่ checkpoint นี้?</p>
            <p className="text-xs">checkpoint เมื่อ: {restoreTarget ? formatTs(restoreTarget.checkpointAt) : ''}</p>
            <p className="text-amber-600 dark:text-amber-400 text-xs">
              session ปัจจุบันจะถูก backup ไว้ก่อน restore — การสนทนาที่เกิดหลัง checkpoint จะหายไป
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>ยกเลิก</Button>
            <Button
              onClick={() => restoreTarget && restore.mutate({ agentId: selectedAgent, filename: restoreTarget.filename })}
              disabled={restore.isPending}
            >
              {restore.isPending ? 'กำลัง Restore...' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
