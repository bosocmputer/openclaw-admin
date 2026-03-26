'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAgents, getConfig, putConfig, getTelegramBindings, api } from '@/lib/api'
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

  const { data: agents = [], isLoading } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: telegramBindings = [] } = useQuery({ queryKey: ['telegram-bindings'], queryFn: getTelegramBindings })

  const trimmedId = newId.trim().toLowerCase()
  const idExists = agents.some(a => a.id === trimmedId)
  const addIdError = idExists && trimmedId ? `Agent ID "${trimmedId}" มีอยู่แล้ว` : ''

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
      qc.invalidateQueries({ queryKey: ['telegram-bindings'] })
      toast.success('ลบ Agent สำเร็จ')
    },
    onError: () => toast.error('ลบ Agent ไม่สำเร็จ'),
  })

  const addAgent = useMutation({
    mutationFn: async () => {
      if (!trimmedId) return
      const workspace = `~/.openclaw/workspace-${trimmedId}`
      await api.post('/api/agents', { id: trimmedId, workspace, accessMode: newAccessMode })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('เพิ่ม Agent สำเร็จ')
      setNewId('')
      setNewAccessMode('general')
      setAdding(false)
    },
    onError: () => toast.error('เพิ่ม Agent ไม่สำเร็จ'),
  })

  const isLastAgent = agents.length <= 1

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-zinc-500 mt-1">แต่ละ agent คือ AI ที่มีบุคลิกและขอบเขตงานแยกกัน เช่น agent ฝ่ายขาย, agent ฝ่ายคลังสินค้า</p>
        </div>
        <Button size="sm" onClick={() => { setAdding(v => !v); setNewId(''); setNewAccessMode('general') }}>
          {adding ? 'ยกเลิก' : '+ เพิ่ม Agent'}
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
                onKeyDown={e => { if (e.key === 'Enter' && !addIdError && trimmedId) addAgent.mutate() }}
                className={`flex-1 border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400 ${addIdError ? 'border-red-400' : ''}`}
                autoFocus
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
              <Button
                onClick={() => addAgent.mutate()}
                disabled={addAgent.isPending || !trimmedId || !!addIdError}
              >
                {addAgent.isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
              </Button>
            </div>
            {addIdError && <p className="text-xs text-red-500">{addIdError}</p>}
            {trimmedId && !addIdError && (
              <p className="text-xs text-zinc-400">
                workspace: <span className="font-mono">~/.openclaw/workspace-{trimmedId}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-zinc-400">Loading...</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(agent => {
          const boundBots = telegramBindings.filter(b => b.agentId === agent.id).map(b => b.accountId)
          return (
            <Card key={agent.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-semibold">{agent.id}</CardTitle>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">{agent.workspace}</p>
                  </div>
                  <Link href={`/agents/${agent.id}`}>
                    <Button size="sm" variant="outline" className="shrink-0">แก้ไข</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Telegram bot bindings */}
                {boundBots.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {boundBots.map(botId => (
                      <Badge key={botId} variant="secondary" className="text-xs">
                        📱 {botId}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">⚠ ยังไม่ได้ผูก Telegram Bot</p>
                )}

                {/* Users */}
                {agent.users && agent.users.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.users.map(u => (
                      <Badge key={u.id} variant="outline" className="text-xs">
                        {u.name ? `${u.name} (${u.id})` : u.id}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Delete — แยกออกมาอยู่ล่าง card */}
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 w-full"
                    onClick={() => setDeleteDialog(agent.id)}
                    disabled={deleteAgent.isPending || isLastAgent}
                    title={isLastAgent ? 'ต้องมี Agent อย่างน้อย 1 ตัว' : ''}
                  >
                    {isLastAgent ? 'ลบไม่ได้ — ต้องมีอย่างน้อย 1 agent' : 'ลบ Agent นี้'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ต้องการลบ agent <span className="font-mono font-medium">{deleteDialog}</span> ออกจากระบบ?
          </p>
          <p className="text-xs text-zinc-500">
            การกระทำนี้จะลบ agent และ bindings ทั้งหมดออกจาก config — workspace และ SOUL.md ที่ server จะยังอยู่
          </p>
          {telegramBindings.some(b => b.agentId === deleteDialog) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ agent นี้ยังผูกกับ Telegram bot อยู่ — หลังลบ bot จะไม่ตอบสนองจนกว่าจะผูก agent ใหม่
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>ยกเลิก</Button>
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
              {deleteAgent.isPending ? 'กำลังลบ...' : 'ลบ Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
