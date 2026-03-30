'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLineConfig, getLineBotInfo, getLineBinding, getLinePending, getAgents,
  addLineAccount, deleteLineAccount, setLineBinding, approveLinePairing, restartGateway,
} from '@/lib/api'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import Image from 'next/image'

export default function LinePage() {
  const qc = useQueryClient()
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [deleteDialog, setDeleteDialog] = useState(false)

  const { data: lineConfig, isLoading } = useQuery({ queryKey: ['line-config'], queryFn: getLineConfig })
  const { data: botInfo } = useQuery({
    queryKey: ['line-botinfo'],
    queryFn: getLineBotInfo,
    enabled: !!lineConfig?.line,
    retry: false,
  })
  const { data: binding } = useQuery({ queryKey: ['line-binding'], queryFn: getLineBinding })
  const { data: pending = [] } = useQuery({
    queryKey: ['line-pending'],
    queryFn: getLinePending,
    refetchInterval: 10000,
    enabled: !!lineConfig?.line,
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })

  const hasLine = !!lineConfig?.line
  const lineOA = lineConfig?.line as Record<string, unknown> | null

  const addMutation = useMutation({
    mutationFn: () => addLineAccount(newToken.trim(), newSecret.trim()),
    onSuccess: async () => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success('LINE OA added — gateway restarted', { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['line-config'] })
      qc.invalidateQueries({ queryKey: ['line-botinfo'] })
      setNewToken('')
      setNewSecret('')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to add LINE OA')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLineAccount,
    onSuccess: async () => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success('LINE OA removed — gateway restarted', { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['line-config'] })
      qc.invalidateQueries({ queryKey: ['line-botinfo'] })
      qc.invalidateQueries({ queryKey: ['line-binding'] })
      setDeleteDialog(false)
    },
    onError: () => toast.error('Failed to remove LINE OA'),
  })

  const bindMutation = useMutation({
    mutationFn: (agentId: string) => setLineBinding(agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['line-binding'] })
      toast.success('Agent binding saved')
    },
    onError: () => toast.error('Failed to save binding'),
  })

  const approveMutation = useMutation({
    mutationFn: (code: string) => approveLinePairing(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['line-pending'] })
      toast.success('Approved')
    },
    onError: () => toast.error('Failed to approve'),
  })

  const qrUrl = botInfo?.basicId
    ? `https://qr-official.line.me/gs/M_${botInfo.basicId}_GW.png`
    : null
  const addFriendUrl = botInfo?.basicId
    ? `https://line.me/R/ti/p/${botInfo.basicId}`
    : null

  if (isLoading) return <p className="text-sm text-zinc-400">Loading...</p>

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">LINE OA</h1>
        <p className="text-sm text-zinc-500 mt-1">ตั้งค่า LINE Official Account — พนักงานแสกน QR เพื่อคุยกับ agent</p>
      </div>

      {!hasLine ? (
        /* ─── ยังไม่มี LINE OA ─── */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เพิ่ม LINE OA</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">
              สร้าง Messaging API channel ที่{' '}
              <span className="font-mono text-xs">developers.line.biz</span>{' '}
              แล้วนำ Channel Access Token และ Channel Secret มาใส่ที่นี่
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Channel Access Token (long-lived)</p>
              <div className="flex gap-2">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={newToken}
                  onChange={e => setNewToken(e.target.value)}
                  placeholder="0+Q0+Uj..."
                  className="font-mono flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => setShowToken(v => !v)}>
                  {showToken ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Channel Secret</p>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={newSecret}
                  onChange={e => setNewSecret(e.target.value)}
                  placeholder="a40cf276..."
                  className="font-mono flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => setShowSecret(v => !v)}>
                  {showSecret ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
            <Button
              disabled={!newToken.trim() || !newSecret.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? 'Adding...' : 'Add LINE OA'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ─── มี LINE OA แล้ว ─── */
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* QR Code */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">QR Code</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">แชร์ให้พนักงานแสกนเพื่อ Add Friend แล้วเริ่ม pairing</p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                {qrUrl ? (
                  <>
                    <div className="rounded-xl border p-3 bg-white">
                      <Image src={qrUrl} alt="LINE QR Code" width={200} height={200} unoptimized />
                    </div>
                    {addFriendUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={addFriendUrl} target="_blank" rel="noopener noreferrer">
                          Copy Add Friend Link
                        </a>
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="w-[200px] h-[200px] rounded-xl border bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <p className="text-xs text-zinc-400">ไม่พบ QR Code</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bot Info + Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {botInfo?.pictureUrl && (
                    <Image
                      src={botInfo.pictureUrl}
                      alt="bot avatar"
                      width={40}
                      height={40}
                      className="rounded-full"
                      unoptimized
                    />
                  )}
                  <div>
                    <CardTitle className="text-base">
                      {botInfo?.displayName ?? 'LINE OA'}
                    </CardTitle>
                    {botInfo?.basicId && (
                      <p className="text-xs text-zinc-500 font-mono">@{botInfo.basicId}</p>
                    )}
                  </div>
                  <Badge className="ml-auto text-xs bg-green-600 text-white">Online</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Agent Binding */}
                <div className="space-y-1">
                  <p className="text-sm font-medium">Agent</p>
                  <p className="text-xs text-zinc-500">ข้อความ DM จะถูก route ไปยัง agent ที่เลือก</p>
                  <div className="flex gap-2 items-center">
                    <Select
                      value={binding?.agentId || '__none__'}
                      onValueChange={v => bindMutation.mutate(v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="ไม่ได้ผูก agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— ไม่ได้ผูก —</SelectItem>
                        {agents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {bindMutation.isPending && <span className="text-xs text-zinc-400">Saving...</span>}
                  </div>
                  {!binding?.agentId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">⚠ ยังไม่ได้ผูก Agent</p>
                  )}
                </div>

                <Separator />

                {/* DM Policy */}
                <div className="space-y-1">
                  <p className="text-sm font-medium">DM Policy</p>
                  <Badge variant="outline" className="text-xs font-mono">
                    {String(lineOA?.dmPolicy ?? 'pairing')}
                  </Badge>
                  <p className="text-xs text-zinc-500">
                    pairing — พนักงานแสกน QR แล้วส่ง pairing code → approve อัตโนมัติ
                  </p>
                </div>

                <Separator />

                {/* Credentials */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Credentials</p>
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Channel Access Token</p>
                    <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
                      {showToken
                        ? String(lineOA?.channelAccessToken ?? '')
                        : '••••••••••••••••••••'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Channel Secret</p>
                    <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                      {showSecret
                        ? String(lineOA?.channelSecret ?? '')
                        : '••••••••••••••••••••'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowToken(v => !v)}>
                      {showToken ? 'Hide Token' : 'Show Token'}
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowSecret(v => !v)}>
                      {showSecret ? 'Hide Secret' : 'Show Secret'}
                    </Button>
                  </div>
                </div>

                <Separator />

                <Button variant="destructive" size="sm" onClick={() => setDeleteDialog(true)}>
                  ลบ LINE OA
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Pending Pairing */}
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pairing รอ Approve</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">พนักงานที่ส่ง pairing code มาแต่ยังไม่ได้ approve — auto-refresh ทุก 10 วินาที</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pending.map(item => (
                    <div key={item.code} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{item.senderId}</p>
                        <p className="text-xs text-zinc-400">
                          Code: <span className="font-mono font-medium">{item.code}</span>
                          {' · '}หมดอายุ: {new Date(item.expiresAt).toLocaleTimeString('th-TH')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(item.code)}
                      >
                        Approve
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* How it works */}
      <Card className="border-zinc-200 bg-zinc-50 dark:bg-zinc-900">
        <CardContent className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">วิธีใช้งาน</p>
          <p>1. <span className="font-medium">เพิ่ม LINE OA</span> — กรอก Channel Access Token และ Channel Secret จาก LINE Developers Console</p>
          <p>2. <span className="font-medium">ตั้ง Webhook URL</span> — ไปที่ LINE Developers Console → Messaging API → Webhook URL</p>
          <p>3. <span className="font-medium">ผูก Agent</span> — เลือก Agent ที่จะรับข้อความจาก LINE OA</p>
          <p>4. <span className="font-medium">แชร์ QR</span> — ให้พนักงาน Add Friend แล้วส่ง pairing code → approve อัตโนมัติ</p>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ LINE OA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ต้องการลบ LINE OA <span className="font-medium">{botInfo?.displayName ?? ''}</span> ออกจากระบบ?
          </p>
          <p className="text-xs text-zinc-500">Bot จะหยุดตอบทันทีหลัง restart gateway</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
