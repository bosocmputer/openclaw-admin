'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLineConfig, getLineBotInfo, getLineBindings, getLinePending, getAgents,
  addLineAccount, deleteLineAccount, setLineBinding, approveLinePairing, restartGateway,
  type LineBotInfo,
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

interface LineAccountState {
  channelAccessToken: string
  channelSecret: string
  dmPolicy: string
  showToken: boolean
  showSecret: boolean
}

function AccountCard({
  accountId,
  botInfo,
  boundAgentId,
  webhookPath,
  agents,
  onBindAgent,
  bindingSaving,
  onDelete,
  deleting,
}: {
  accountId: string
  botInfo: LineBotInfo | null
  boundAgentId: string
  webhookPath?: string
  agents: { id: string }[]
  onBindAgent: (agentId: string) => void
  bindingSaving: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const qrUrl = botInfo?.basicId
    ? `https://qr-official.line.me/gs/M_${botInfo.basicId}_GW.png`
    : null
  const addFriendUrl = botInfo?.basicId
    ? `https://line.me/R/ti/p/${botInfo.basicId}`
    : null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          {botInfo?.pictureUrl && (
            <Image src={botInfo.pictureUrl} alt="bot" width={32} height={32} className="rounded-full" unoptimized />
          )}
          <CardTitle className="text-base">
            {botInfo?.displayName ?? (accountId === 'default' ? 'Default OA' : `OA: ${accountId}`)}
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">{accountId}</Badge>
          {accountId === 'default' && (
            <Badge className="text-xs bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">Default</Badge>
          )}
          {boundAgentId && (
            <Badge variant="secondary" className="text-xs">→ agent: {boundAgentId}</Badge>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="text-xs ml-auto"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? 'Deleting...' : 'Delete OA'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agent Binding */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Agent</p>
          <p className="text-xs text-zinc-500">ข้อความ DM จะถูก route ไปยัง agent ที่เลือก</p>
          <div className="flex gap-2 items-center">
            <Select
              value={boundAgentId || '__none__'}
              onValueChange={v => onBindAgent(v === '__none__' ? '' : (v ?? ''))}
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
            {bindingSaving && <span className="text-xs text-zinc-400">Saving...</span>}
          </div>
          {!boundAgentId && (
            <p className="text-xs text-amber-600 dark:text-amber-400">⚠ ยังไม่ได้ผูก Agent</p>
          )}
        </div>

        <Separator />

        {/* Webhook Path */}
        {webhookPath && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Webhook URL</p>
            <p className="text-xs text-zinc-500">ตั้งค่าใน LINE Developers Console → Messaging API</p>
            <p className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1 break-all">
              {'<tunnel-url>'}{webhookPath}
            </p>
          </div>
        )}

        {webhookPath && <Separator />}

        {/* QR Code */}
        <div className="space-y-2">
          <p className="text-sm font-medium">QR Code</p>
          <p className="text-xs text-zinc-500">แชร์ให้พนักงาน Add Friend เพื่อเริ่ม pairing</p>
          <div className="flex items-start gap-4">
            {qrUrl ? (
              <div className="rounded-xl border p-2 bg-white shrink-0">
                <Image src={qrUrl} alt="LINE QR" width={120} height={120} unoptimized />
              </div>
            ) : (
              <div className="w-[120px] h-[120px] rounded-xl border bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <p className="text-xs text-zinc-400 text-center px-2">ไม่พบ QR</p>
              </div>
            )}
            <div className="space-y-2 pt-1">
              {botInfo?.basicId && (
                <p className="text-xs font-mono text-zinc-500">@{botInfo.basicId}</p>
              )}
              {addFriendUrl && (
                <a
                  href={addFriendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  Add Friend Link
                </a>
              )}
              <p className="text-xs text-zinc-400">DM Policy: pairing (auto-approve)</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function LinePage() {
  const qc = useQueryClient()
  const [newAccountId, setNewAccountId] = useState('')
  const [newToken, setNewToken] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [newWebhookPath, setNewWebhookPath] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)

  const { data: lineConfig, isLoading } = useQuery({ queryKey: ['line-config'], queryFn: getLineConfig })
  const { data: botInfoMap = {} } = useQuery({
    queryKey: ['line-botinfo'],
    queryFn: getLineBotInfo,
    enabled: !!lineConfig?.line,
    retry: false,
  })
  const { data: bindings = [] } = useQuery({ queryKey: ['line-bindings'], queryFn: getLineBindings })
  const { data: pending = [] } = useQuery({
    queryKey: ['line-pending'],
    queryFn: getLinePending,
    refetchInterval: 10000,
    enabled: !!lineConfig?.line,
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })

  // รวบรวม account IDs และ webhookPath จาก config
  const line = lineConfig?.line as Record<string, unknown> | null
  const accountIds: string[] = []
  const webhookPaths: Record<string, string> = {}
  if (line) {
    const accounts = line.accounts as Record<string, unknown> | undefined
    if (accounts) {
      for (const [id, acc] of Object.entries(accounts)) {
        accountIds.push(id)
        const wp = (acc as Record<string, unknown>)?.webhookPath
        if (typeof wp === 'string') webhookPaths[id] = wp
      }
    }
    if (line.channelAccessToken) {
      if (!accountIds.includes('default')) accountIds.push('default')
      const wp = line.webhookPath
      if (typeof wp === 'string') webhookPaths['default'] = wp
    }
  }

  const addMutation = useMutation({
    mutationFn: () => addLineAccount(newAccountId.trim() || 'default', newToken.trim(), newSecret.trim(), newWebhookPath.trim() || undefined),
    onSuccess: async () => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success('LINE OA added — gateway restarted', { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['line-config'] })
      qc.invalidateQueries({ queryKey: ['line-botinfo'] })
      setNewAccountId('')
      setNewToken('')
      setNewSecret('')
      setNewWebhookPath('')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to add LINE OA')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteLineAccount(accountId),
    onSuccess: async (_, accountId) => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success(`OA "${accountId}" removed — gateway restarted`, { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['line-config'] })
      qc.invalidateQueries({ queryKey: ['line-botinfo'] })
      qc.invalidateQueries({ queryKey: ['line-bindings'] })
      setDeleteDialog(null)
    },
    onError: () => toast.error('Failed to remove LINE OA'),
  })

  const bindMutation = useMutation({
    mutationFn: ({ accountId, agentId }: { accountId: string; agentId: string }) =>
      setLineBinding(accountId, agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['line-bindings'] })
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

  const addIdError = newAccountId.trim() && accountIds.includes(newAccountId.trim())
    ? `Account ID "${newAccountId.trim()}" มีอยู่แล้ว`
    : ''

  if (isLoading) return <p className="text-sm text-zinc-400">Loading...</p>

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">LINE OA</h1>
        <p className="text-sm text-zinc-500 mt-1">ตั้งค่า LINE Official Account — รองรับหลาย OA แต่ละตัวผูกกับ agent ต่างกันได้</p>
      </div>

      {/* How it works */}
      <Card className="border-zinc-200 bg-zinc-50 dark:bg-zinc-900">
        <CardContent className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">วิธีใช้งาน</p>
          <p>1. <span className="font-medium">เพิ่ม LINE OA</span> — กรอก Account ID (เช่น <span className="font-mono">sale</span>, <span className="font-mono">stock</span>) + Channel Access Token + Channel Secret</p>
          <p>2. <span className="font-medium">ตั้ง Webhook URL</span> — ไปที่ LINE Developers Console → Messaging API → Webhook URL (แต่ละ OA ใช้ path ต่างกัน เช่น <span className="font-mono">/line/webhook/sale</span>)</p>
          <p>3. <span className="font-medium">ผูก Agent</span> — เลือก Agent ที่ OA นั้นจะ route ข้อความไป</p>
          <p>4. <span className="font-medium">แชร์ QR</span> — ให้พนักงาน Add Friend แล้วส่ง pairing code → approve อัตโนมัติ</p>
        </CardContent>
      </Card>

      {/* Add new OA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">เพิ่ม LINE OA ใหม่</CardTitle>
          <p className="text-xs text-zinc-500 mt-1">สร้าง Messaging API channel ที่ developers.line.biz แล้วนำ token มาใส่</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Account ID เช่น sale, stock"
              value={newAccountId}
              onChange={e => setNewAccountId(e.target.value)}
              className={`w-36 ${addIdError ? 'border-red-400' : ''}`}
            />
            <Input
              placeholder="Webhook path เช่น /line/webhook/sale"
              value={newWebhookPath}
              onChange={e => setNewWebhookPath(e.target.value)}
              className="w-56 font-mono"
            />
            <div className="flex gap-2 flex-1 min-w-0">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder="Channel Access Token"
                value={newToken}
                onChange={e => setNewToken(e.target.value)}
                className="font-mono flex-1 min-w-0"
              />
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowToken(v => !v)}>
                {showToken ? 'Hide' : 'Show'}
              </Button>
            </div>
            <div className="flex gap-2 flex-1 min-w-0">
              <Input
                type={showSecret ? 'text' : 'password'}
                placeholder="Channel Secret"
                value={newSecret}
                onChange={e => setNewSecret(e.target.value)}
                className="font-mono flex-1 min-w-0"
              />
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowSecret(v => !v)}>
                {showSecret ? 'Hide' : 'Show'}
              </Button>
            </div>
            <Button
              disabled={!newToken.trim() || !newSecret.trim() || !!addIdError || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? 'Adding...' : 'Add OA'}
            </Button>
          </div>
          {addIdError && <p className="text-xs text-red-500">{addIdError}</p>}
          <p className="text-xs text-zinc-400">Account ID ใช้ตั้งชื่อสั้นๆ เช่น <span className="font-mono">sale</span> — Webhook path ควรไม่ซ้ำกันในแต่ละ OA เช่น <span className="font-mono">/line/webhook/sale</span></p>
        </CardContent>
      </Card>

      <Separator />

      {accountIds.length === 0 && (
        <p className="text-sm text-zinc-400">ยังไม่มี LINE OA — เพิ่มด้านบนได้เลย</p>
      )}

      {/* Account cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {accountIds.map(id => (
          <AccountCard
            key={id}
            accountId={id}
            botInfo={botInfoMap[id] ?? null}
            boundAgentId={bindings.find(b => b.accountId === id)?.agentId ?? ''}
            webhookPath={webhookPaths[id]}
            agents={agents}
            onBindAgent={agentId => bindMutation.mutate({ accountId: id, agentId })}
            bindingSaving={bindMutation.isPending}
            onDelete={() => setDeleteDialog(id)}
            deleting={deleteMutation.isPending && deleteDialog === id}
          />
        ))}
      </div>

      {/* Pending Pairing */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pairing รอ Approve</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">auto-refresh ทุก 10 วินาที</p>
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

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ LINE OA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ต้องการลบ OA{' '}
            <span className="font-medium">
              {deleteDialog ? (botInfoMap[deleteDialog]?.displayName ?? deleteDialog) : ''}
            </span>{' '}
            ออกจากระบบ?
          </p>
          <p className="text-xs text-zinc-500">Bot จะหยุดตอบทันทีหลัง restart gateway</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteDialog) deleteMutation.mutate(deleteDialog) }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
