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
            ให้ระบบอื่นส่งข้อมูลเข้ามาหา AI Agent ได้โดยตรง — AI จะรับข้อมูลแล้วประมวลผลทันที
          </p>
        </div>
        <Button onClick={() => setAddDialog(true)}>+ เพิ่ม Route</Button>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-4 space-y-4">
        <div>
          <p className="font-semibold text-sm text-blue-800 dark:text-blue-200">Webhooks คืออะไร?</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Webhooks เหมือนกับ "ประตูรับข้อมูล" ที่เปิดให้ระบบอื่น (เช่น ระบบ ERP, สต๊อกสินค้า, หรือแอปภายนอก)
            ส่งข้อความเข้ามาหา AI Agent ของคุณได้โดยตรง โดยไม่ต้องมีคนพิมพ์เอง
          </p>
        </div>

        <div className="border-t border-blue-200 dark:border-blue-800 pt-3">
          <p className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-2">ต่างจาก LINE OA อย่างไร?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-md bg-white dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-3 space-y-1">
              <p className="font-semibold text-blue-700 dark:text-blue-300">LINE OA</p>
              <p className="text-blue-600 dark:text-blue-400">ลูกค้าพิมพ์ข้อความใน LINE → AI ตอบกลับลูกค้า</p>
              <p className="text-zinc-500 dark:text-zinc-400 italic">เหมาะสำหรับ: สนทนากับลูกค้า</p>
            </div>
            <div className="rounded-md bg-white dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-3 space-y-1">
              <p className="font-semibold text-blue-700 dark:text-blue-300">Webhooks</p>
              <p className="text-blue-600 dark:text-blue-400">ระบบ ERP ส่งข้อมูลเข้า → AI ประมวลผลอัตโนมัติ</p>
              <p className="text-zinc-500 dark:text-zinc-400 italic">เหมาะสำหรับ: แจ้งเตือน, automation</p>
            </div>
          </div>
        </div>

        <div className="border-t border-blue-200 dark:border-blue-800 pt-3">
          <p className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-2">ตัวอย่างการใช้งาน</p>
          <div className="space-y-2 text-xs text-blue-700 dark:text-blue-300">
            <div className="flex gap-2">
              <span className="shrink-0">📦</span>
              <span><span className="font-medium">แจ้งเตือนสต๊อกต่ำ</span> — ระบบ ERP ตรวจพบสินค้าเหลือน้อยกว่า 10 ชิ้น → ส่งข้อมูลเข้า webhook → AI แจ้งทีมคลังทันที</span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0">🧾</span>
              <span><span className="font-medium">ยืนยันออเดอร์</span> — ลูกค้าสั่งของผ่านเว็บ → ระบบส่งรายการเข้า webhook → AI สรุปและแจ้งฝ่ายขายอัตโนมัติ</span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0">💳</span>
              <span><span className="font-medium">แจ้งชำระเงิน</span> — ลูกค้าโอนเงิน → ธนาคารส่ง notification เข้า webhook → AI ตรวจสอบและยืนยันยอด</span>
            </div>
          </div>
        </div>

        <div className="border-t border-blue-200 dark:border-blue-800 pt-3">
          <p className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-1">วิธีส่งข้อมูลเข้า Webhook</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">ระบบภายนอกส่ง HTTP POST พร้อม Secret ที่ตั้งไว้:</p>
          <div className="bg-zinc-900 rounded-md p-3 font-mono text-xs text-green-400 overflow-x-auto">
            <p className="text-zinc-400"># ตัวอย่าง: แจ้ง agent "sale" ว่าสต๊อกต่ำ</p>
            <p>curl -X POST https://your-gateway.com/webhooks/stock-alert \</p>
            <p className="pl-4">-H <span className="text-yellow-300">"X-Webhook-Secret: your-secret"</span> \</p>
            <p className="pl-4">-H <span className="text-yellow-300">"Content-Type: application/json"</span> \</p>
            <p className="pl-4">-d <span className="text-yellow-300">'{"{"}  "message": "สินค้า โช๊คพวงมาลัย เหลือ 3 ชิ้น" {"}"}'</span></p>
          </div>
          <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">⚠️ ต้อง restart gateway หลังเพิ่ม/แก้ไข route เพื่อให้มีผล</p>
        </div>
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
          <div className="space-y-4 text-sm">
            <div>
              <label className="block font-medium mb-0.5">ชื่อ Route <span className="text-red-500">*</span></label>
              <p className="text-xs text-zinc-400 mb-1">ชื่อสำหรับอ้างอิง ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข ขีด ได้เท่านั้น เช่น <span className="font-mono">stock-alert</span></p>
              <Input placeholder="stock-alert" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block font-medium mb-0.5">Path (URL รับข้อมูล) <span className="text-red-500">*</span></label>
              <p className="text-xs text-zinc-400 mb-1">ระบบภายนอกจะ POST มาที่ URL นี้ เช่น ถ้าตั้ง <span className="font-mono">/webhooks/stock-alert</span> ก็ส่งมาที่ <span className="font-mono">https://your-gateway.com/webhooks/stock-alert</span></p>
              <Input placeholder="/webhooks/stock-alert" value={form.path} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} />
            </div>
            <div>
              <label className="block font-medium mb-0.5">Agent ที่รับข้อมูล (Session Key) <span className="text-red-500">*</span></label>
              <p className="text-xs text-zinc-400 mb-1">
                เลือกว่าจะให้ AI Agent ไหนรับและประมวลผลข้อมูลนี้
                รูปแบบ: <span className="font-mono">agent:ชื่อ-agent:hook:ชื่อ-route</span>
                <br />เช่น ถ้าต้องการให้ agent <span className="font-mono">sale</span> รับ → ใส่ <span className="font-mono">agent:sale:hook:stock-alert</span>
              </p>
              <Input placeholder="agent:sale:hook:stock-alert" value={form.sessionKey} onChange={e => setForm(f => ({ ...f, sessionKey: e.target.value }))} />
            </div>
            <div>
              <label className="block font-medium mb-0.5">Secret (รหัสความปลอดภัย) <span className="text-red-500">*</span></label>
              <p className="text-xs text-zinc-400 mb-1">รหัสที่ระบบภายนอกต้องส่งมาด้วยทุกครั้ง (header <span className="font-mono">X-Webhook-Secret</span>) ป้องกันคนอื่นส่งข้อมูลเข้ามา ตั้งเป็น random text ยาวๆ</p>
              <Input placeholder="เช่น: a3f9c2d8e1b4f7a0..." value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
            </div>
            <div>
              <label className="block font-medium mb-0.5">คำอธิบาย</label>
              <Input placeholder="เช่น: รับแจ้งเตือนสต๊อกต่ำจากระบบ ERP" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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
