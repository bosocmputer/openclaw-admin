'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface WebhookRoute {
  path: string
  sessionKey: string
  secret: string
  description?: string
  enabled?: boolean
}

async function fetchWebhooks(): Promise<Record<string, WebhookRoute>> {
  const { data } = await api.get('/api/webhooks')
  return data
}

export default function WebhooksPage() {
  const qc = useQueryClient()
  const [addDialog, setAddDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', path: '', sessionKey: '', secret: '', description: '' })

  const { data: webhooks = {}, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: fetchWebhooks,
  })

  const add = useMutation({
    mutationFn: (body: typeof form) => api.post('/api/webhooks', body),
    onSuccess: () => {
      toast.success('เพิ่ม Webhook route สำเร็จ — restart gateway เพื่อให้มีผล')
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      setAddDialog(false)
      setForm({ name: '', path: '', sessionKey: '', secret: '', description: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'เพิ่มไม่สำเร็จ'),
  })

  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.patch(`/api/webhooks/${name}`, { enabled }),
    onSuccess: () => {
      toast.success('อัปเดตแล้ว — restart gateway เพื่อให้มีผล')
      qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: () => toast.error('อัปเดตไม่สำเร็จ'),
  })

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/api/webhooks/${name}`),
    onSuccess: () => {
      toast.success('ลบ Webhook route แล้ว')
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      setDeleteTarget(null)
    },
    onError: () => toast.error('ลบไม่สำเร็จ'),
  })

  const entries = Object.entries(webhooks)

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-zinc-500 mt-1">
            รับ HTTP POST จากระบบภายนอก (ERP, Line Notify, ฯลฯ) แล้ว inject เข้า agent session โดยตรง
          </p>
        </div>
        <Button onClick={() => setAddDialog(true)}>+ เพิ่ม Route</Button>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-medium">วิธีใช้งาน</p>
        <p>ส่ง POST ไปที่ <span className="font-mono">https://&lt;gateway-url&gt;/webhooks/&lt;path&gt;</span> พร้อม header <span className="font-mono">X-Webhook-Secret: &lt;secret&gt;</span></p>
        <p>Body เป็น JSON หรือ text — gateway จะส่งต่อเข้า session ที่กำหนดใน <span className="font-mono">sessionKey</span></p>
        <p className="text-xs text-blue-600 dark:text-blue-400">หมายเหตุ: ต้อง restart gateway หลังเพิ่ม/แก้ไข route เพื่อให้มีผล</p>
      </div>

      {isLoading && <p className="text-sm text-zinc-400">กำลังโหลด...</p>}

      {!isLoading && entries.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-zinc-400 text-sm">
            ยังไม่มี Webhook route — กด <span className="font-medium">+ เพิ่ม Route</span> เพื่อเริ่มต้น
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {entries.map(([name, route]) => (
          <Card key={name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-base font-mono">{name}</CardTitle>
                  <Badge variant={route.enabled === false ? 'secondary' : 'default'} className="text-xs shrink-0">
                    {route.enabled === false ? 'disabled' : 'enabled'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle.mutate({ name, enabled: route.enabled === false })}
                    disabled={toggle.isPending}
                  >
                    {route.enabled === false ? 'Enable' : 'Disable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={() => setDeleteTarget(name)}
                  >
                    ลบ
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {route.description && <p className="text-zinc-500">{route.description}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
                <p><span className="text-zinc-400">path:</span> <span className="text-zinc-700 dark:text-zinc-300">{route.path}</span></p>
                <p><span className="text-zinc-400">sessionKey:</span> <span className="text-zinc-700 dark:text-zinc-300">{route.sessionKey}</span></p>
                <p><span className="text-zinc-400">secret:</span> <span className="text-zinc-500">{route.secret}</span></p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>เพิ่ม Webhook Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-zinc-500 mb-1">Name <span className="text-red-500">*</span> <span className="text-zinc-400 font-mono text-xs">(a-z 0-9 _ -)</span></label>
              <Input placeholder="erp-alert" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Path <span className="text-red-500">*</span></label>
              <Input placeholder="/webhooks/erp-alert" value={form.path} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Session Key <span className="text-red-500">*</span></label>
              <Input placeholder="agent:sale:hook:erp-alert" value={form.sessionKey} onChange={e => setForm(f => ({ ...f, sessionKey: e.target.value }))} />
              <p className="text-xs text-zinc-400 mt-1">format: <span className="font-mono">agent:&lt;agentId&gt;:hook:&lt;name&gt;</span></p>
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Secret <span className="text-red-500">*</span></label>
              <Input placeholder="random secret สำหรับ X-Webhook-Secret header" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Description</label>
              <Input placeholder="อธิบายว่า webhook นี้ใช้ทำอะไร" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>ยกเลิก</Button>
            <Button
              onClick={() => add.mutate(form)}
              disabled={add.isPending || !form.name || !form.path || !form.sessionKey || !form.secret}
            >
              {add.isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ Webhook Route</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ต้องการลบ route <span className="font-mono font-medium">{deleteTarget}</span>? การกระทำนี้ไม่สามารถย้อนกลับได้
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              disabled={remove.isPending}
            >
              ลบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
