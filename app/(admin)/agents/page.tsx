'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAgents, getConfig, putConfig, api } from '@/lib/api'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useState } from 'react'

const ACCESS_MODES = [
  { value: 'admin',    label: 'admin',    desc: 'เห็นทุกอย่าง รวมถึงรายงานและวิเคราะห์' },
  { value: 'sales',    label: 'sales',    desc: 'แผนกขาย' },
  { value: 'purchase', label: 'purchase', desc: 'แผนกจัดซื้อ' },
  { value: 'stock',    label: 'stock',    desc: 'แผนกคลังสินค้า' },
  { value: 'general',  label: 'general',  desc: 'ทั่วไป (ค่าเริ่มต้น)' },
]

export default function AgentsPage() {
  const qc = useQueryClient()
  const [newId, setNewId] = useState('')
  const [newAccessMode, setNewAccessMode] = useState('general')
  const [adding, setAdding] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)

  const { data: agents, isLoading } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      if (!config) return
      await putConfig({
        ...config,
        agents: {
          ...config.agents,
          list: config.agents?.list?.filter(a => a.id !== id) ?? [],
        },
        bindings: config.bindings?.filter(b => b.agentId !== id) ?? [],
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('Agent deleted')
    },
    onError: () => toast.error('Failed to delete agent'),
  })

  const addAgent = useMutation({
    mutationFn: async () => {
      if (!newId.trim()) return
      const id = newId.trim().toLowerCase()
      const workspace = `~/.openclaw/workspace-${id}`
      // ใช้ Express API เพื่อ auto-generate SOUL.md จาก template
      await api.post('/api/agents', { id, workspace, accessMode: newAccessMode })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('Agent added — SOUL.md generated from template')
      setNewId('')
      setNewAccessMode('general')
      setAdding(false)
    },
    onError: () => toast.error('Failed to add agent'),
  })

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-zinc-500 mt-1">แต่ละ agent คือ AI ที่มีบุคลิกและขอบเขตงานแยกกัน เช่น agent ฝ่ายขาย, agent ฝ่ายคลังสินค้า</p>
        </div>
        <Button size="sm" onClick={() => setAdding(v => !v)}>
          {adding ? 'Cancel' : '+ Add Agent'}
        </Button>
      </div>

      {adding && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs text-zinc-500">
              ระบบจะสร้าง workspace ที่ <span className="font-mono">~/.openclaw/workspace-[id]</span> และ generate <span className="font-mono">SOUL.md</span> จาก template ตาม Access Mode ให้อัตโนมัติ
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Agent ID เช่น sale, support"
                value={newId}
                onChange={e => setNewId(e.target.value.toLowerCase().replace(/\s/g, ''))}
                onKeyDown={e => e.key === 'Enter' && addAgent.mutate()}
                className="flex-1 border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <Select value={newAccessMode} onValueChange={v => v && setNewAccessMode(v)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_MODES.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="font-mono font-medium">{m.label}</span>
                      <span className="text-zinc-400 ml-1 text-xs">— {m.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addAgent.mutate()} disabled={addAgent.isPending || !newId.trim()}>
                {addAgent.isPending ? 'Adding...' : 'Add'}
              </Button>
            </div>
            {newId && (
              <p className="text-xs text-zinc-400">
                workspace: <span className="font-mono">~/.openclaw/workspace-{newId}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-zinc-400">Loading...</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents?.map(agent => (
          <Card key={agent.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">{agent.id}</CardTitle>
                <div className="flex gap-2">
                  <Link href={`/agents/${agent.id}`}>
                    <Button size="sm" variant="outline">Edit</Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteDialog(agent.id)}
                    disabled={deleteAgent.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500 font-mono">{agent.workspace}</p>
              {agent.users && agent.users.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {agent.users.map(u => (
                    <Badge key={u.id} variant="secondary" className="text-xs">
                      {u.name ? `${u.name} (${u.id})` : u.id}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ต้องการลบ agent <span className="font-mono font-medium">{deleteDialog}</span> ออกจากระบบ?
          </p>
          <p className="text-xs text-zinc-500">การกระทำนี้จะลบ agent และ bindings ทั้งหมดของ agent นี้ออกจาก config</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteAgent.isPending}
              onClick={() => {
                if (deleteDialog) {
                  deleteAgent.mutate(deleteDialog)
                  setDeleteDialog(null)
                }
              }}
            >
              {deleteAgent.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
