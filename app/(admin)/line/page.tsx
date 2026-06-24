'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLineConfig, getLineBotInfo, getLineBindings, getLinePending, getAgents,
  addLineAccount, deleteLineAccount, updateLineAccount, setLineBinding, approveLinePairing, restartGateway,
  getLineDeliveryStats,
  applyChannelBinding,
  type ChannelBindingApplyResult,
  type LineBotInfo,
  type LineDeliveryStats,
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

function AccountCard({
  accountId,
  botInfo,
  boundAgentId,
  webhookPath,
  agents,
  bindingSaving,
  onEdit,
  editing,
  onDelete,
  deleting,
  selectedAgentId,
  pendingRestart,
  onSelectAgent,
  onSaveApply,
  onSaveOnly,
  onCancelBindingChange,
}: {
  accountId: string
  botInfo: LineBotInfo | null
  boundAgentId: string
  webhookPath?: string
  agents: { id: string }[]
  bindingSaving: boolean
  onEdit: () => void
  editing: boolean
  onDelete: () => void
  deleting: boolean
  selectedAgentId: string
  pendingRestart: boolean
  onSelectAgent: (agentId: string) => void
  onSaveApply: () => void
  onSaveOnly: () => void
  onCancelBindingChange: () => void
}) {
  const qrUrl = botInfo?.basicId
    ? `https://qr-official.line.me/gs/M_${botInfo.basicId}_GW.png`
    : null
  const addFriendUrl = botInfo?.basicId
    ? `https://line.me/R/ti/p/${botInfo.basicId}`
    : null
  const hasBindingChange = selectedAgentId !== (boundAgentId || '')

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
          {hasBindingChange && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
              รอ apply: {selectedAgentId || 'ไม่ผูก agent'}
            </Badge>
          )}
          {!hasBindingChange && pendingRestart && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
              รอ Restart
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="text-xs" disabled={editing} onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? 'Deleting...' : 'Delete OA'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agent Binding */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Agent</p>
          <p className="text-xs text-zinc-500">ข้อความ DM จะถูก route ไปยัง agent ที่เลือก</p>
          <div className="flex gap-2 items-center">
            <Select
              value={selectedAgentId || '__none__'}
              onValueChange={v => onSelectAgent(v === '__none__' ? '' : (v ?? ''))}
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
          {hasBindingChange && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                  เปลี่ยน Agent แล้ว ต้อง Apply เพื่อให้ runtime ใช้ route ใหม่
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                  Save + Apply จะ reset session ของ LINE นี้ และ restart gateway ให้พร้อมทดสอบ
                </p>
              </div>
              <Button size="sm" disabled={bindingSaving || !selectedAgentId} onClick={onSaveApply}>
                Save + Apply
              </Button>
              <Button size="sm" variant="outline" disabled={bindingSaving || !selectedAgentId} onClick={onSaveOnly}>
                Save only
              </Button>
              <Button size="sm" variant="ghost" disabled={bindingSaving} onClick={onCancelBindingChange}>
                Cancel
              </Button>
            </div>
          )}
          {!hasBindingChange && pendingRestart && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="min-w-0 flex-1 text-xs text-amber-800 dark:text-amber-200">
                Binding ถูก save แล้ว แต่ยังไม่ได้ apply กับ gateway
              </p>
              <Button size="sm" disabled={bindingSaving || !selectedAgentId} onClick={onSaveApply}>
                Apply now
              </Button>
            </div>
          )}
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

function lineStatsDateToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '')
}

function statCount(part?: LineDeliveryStats['reply']): string {
  if (!part) return '-'
  if (part.status !== 'ok') return 'unavailable'
  const value = part.count ?? part.totalUsage ?? part.value
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '-'
}

function DeliveryQuotaPanel({ accountIds }: { accountIds: string[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState(accountIds[0] ?? '')
  const [date, setDate] = useState(lineStatsDateToday())

  const accountId = (accountIds.includes(selectedAccountId) ? selectedAccountId : accountIds[0]) ?? ''
  const statsQuery = useQuery({
    queryKey: ['line-delivery-stats', accountId, date],
    queryFn: () => getLineDeliveryStats(accountId, date),
    enabled: Boolean(accountId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const stats = statsQuery.data as LineDeliveryStats | undefined

  if (accountIds.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Delivery & Quota</CardTitle>
            <p className="mt-1 text-xs text-zinc-500">
              ดูจำนวน reply/push และ quota ของ LINE OA วันนี้ ใช้เป็น insight ไม่ใช่ health fail
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={accountId} onValueChange={value => setSelectedAccountId(value ?? '')}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="เลือก LINE OA" />
              </SelectTrigger>
              <SelectContent>
                {accountIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              aria-label="LINE stats date"
              value={date}
              onChange={event => setDate(event.target.value.replace(/\D/g, '').slice(0, 8))}
              className="h-9 w-[120px] font-mono"
              placeholder="YYYYMMDD"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => statsQuery.refetch()}
              disabled={statsQuery.isFetching}
            >
              {statsQuery.isFetching ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Reply messages', value: statCount(stats?.reply), hint: 'ใช้ replyToken ก่อน' },
            { label: 'Push messages', value: statCount(stats?.push), hint: 'fallback หรือเกิน 5 objects' },
            { label: 'Monthly usage', value: statCount(stats?.consumption), hint: 'LINE quota consumption' },
            { label: 'Monthly quota', value: statCount(stats?.quota), hint: 'quota จาก LINE API' },
          ].map(item => (
            <div key={item.label} className="rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-900/60">
              <p className="text-xs text-zinc-500">{item.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{item.value}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">{item.hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {statsQuery.isError ? <span className="text-amber-600">โหลด stats ไม่สำเร็จ</span> : null}
          {stats?.safeMessage ? <span>{stats.safeMessage}</span> : null}
          {stats?.checkedAt ? <span>checked {new Date(stats.checkedAt).toLocaleString('th-TH')}</span> : null}
          {stats?.cache?.hit ? <Badge variant="outline">cache</Badge> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ChannelApplyResultPanel({ result }: { result: ChannelBindingApplyResult }) {
  const resetTotal = (result.reset || []).reduce((sum, item) => sum + (item.removed || 0), 0)
  return (
    <div className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'}`}>
      <p className="font-medium">{result.ok ? 'พร้อมทดสอบแล้ว' : 'Apply สำเร็จบางส่วน'}</p>
      <p className="mt-1">{result.safeMessage || result.error || 'No detail'}</p>
      <div className="mt-2 grid gap-1 text-xs">
        <span>Agent: {result.oldAgentId || '-'} → {result.newAgentId || '-'}</span>
        <span>Reset sessions: {resetTotal} session(s)</span>
        <span>Restart: {result.restart?.ok === false ? 'failed' : result.restart ? 'ok' : 'skipped'}</span>
        {typeof result.durationMs === 'number' && <span>Duration: {result.durationMs}ms</span>}
      </div>
      {result.ok && (
        <div className="mt-3 rounded-md bg-white/70 p-2 text-xs text-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-300">
          <p className="font-medium">พร้อมใช้ทันที</p>
          <p>ข้อความถัดไปใน LINE จะใช้ agent ใหม่แล้ว ถ้าต้องการตรวจเองให้ถาม: คุณคือ agent อะไร มี tools อะไรบ้าง</p>
        </div>
      )}
    </div>
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
  const [editDialog, setEditDialog] = useState<string | null>(null)
  const [editToken, setEditToken] = useState('')
  const [editSecret, setEditSecret] = useState('')
  const [editWebhookPath, setEditWebhookPath] = useState('')
  const [showEditToken, setShowEditToken] = useState(false)
  const [showEditSecret, setShowEditSecret] = useState(false)
  const [draftBindings, setDraftBindings] = useState<Record<string, string>>({})
  const [savedOnlyBindings, setSavedOnlyBindings] = useState<Record<string, boolean>>({})
  const [applyDialog, setApplyDialog] = useState<{ accountId: string; oldAgentId: string | null; newAgentId: string } | null>(null)
  const [applyResetSessions, setApplyResetSessions] = useState(true)
  const [applyResult, setApplyResult] = useState<ChannelBindingApplyResult | null>(null)

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
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['line-bindings'] })
      setDraftBindings(prev => {
        const next = { ...prev }
        delete next[vars.accountId]
        return next
      })
      setSavedOnlyBindings(prev => ({ ...prev, [vars.accountId]: true }))
      toast.success('Agent binding saved — restart required')
    },
    onError: () => toast.error('Failed to save binding'),
  })

  const applyBindingMutation = useMutation({
    mutationFn: ({ accountId, agentId, resetSessions }: { accountId: string; agentId: string; resetSessions: boolean }) =>
      applyChannelBinding({ channel: 'line', accountId, agentId, resetSessions, restartGateway: true }),
    onSuccess: result => {
      setApplyResult(result)
      if (result.accountId) {
        setDraftBindings(prev => {
          const next = { ...prev }
          delete next[result.accountId!]
          return next
        })
        setSavedOnlyBindings(prev => {
          const next = { ...prev }
          delete next[result.accountId!]
          return next
        })
      }
      qc.invalidateQueries({ queryKey: ['line-bindings'] })
      toast.success('Agent binding applied')
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: ChannelBindingApplyResult } })?.response?.data
      if (data) setApplyResult(data)
      toast.error(data?.safeMessage || 'Failed to apply binding')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => updateLineAccount(editDialog!, {
      channelAccessToken: editToken.trim() || undefined,
      channelSecret: editSecret.trim() || undefined,
      webhookPath: editWebhookPath.trim() || undefined,
    }),
    onSuccess: async () => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success('LINE OA updated — gateway restarted', { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['line-config'] })
      qc.invalidateQueries({ queryKey: ['line-botinfo'] })
      setEditDialog(null)
    },
    onError: () => toast.error('Failed to update LINE OA'),
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

  function openApplyBinding(accountId: string, newAgentId: string, oldAgentId: string | null) {
    if (!newAgentId) {
      toast.error('เลือก Agent ก่อน Apply')
      return
    }
    setApplyDialog({ accountId, oldAgentId, newAgentId })
    setApplyResetSessions(true)
    setApplyResult(null)
  }

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

      <DeliveryQuotaPanel accountIds={accountIds} />

      {/* Account cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {accountIds.map(id => {
          const boundAgentId = bindings.find(b => b.accountId === id)?.agentId ?? ''
          const selectedAgentId = draftBindings[id] ?? boundAgentId
          return (
            <AccountCard
              key={id}
              accountId={id}
              botInfo={botInfoMap[id] ?? null}
              boundAgentId={boundAgentId}
              webhookPath={webhookPaths[id]}
              agents={agents}
              selectedAgentId={selectedAgentId}
              pendingRestart={Boolean(savedOnlyBindings[id])}
              onSelectAgent={agentId => setDraftBindings(prev => ({ ...prev, [id]: agentId }))}
              onSaveApply={() => openApplyBinding(id, selectedAgentId, boundAgentId || null)}
              onSaveOnly={() => bindMutation.mutate({ accountId: id, agentId: selectedAgentId })}
              onCancelBindingChange={() => setDraftBindings(prev => {
                const next = { ...prev }
                delete next[id]
                return next
              })}
              bindingSaving={bindMutation.isPending || applyBindingMutation.isPending}
              onEdit={() => {
                setEditToken('')
                setEditSecret('')
                setEditWebhookPath(webhookPaths[id] ?? '')
                setEditDialog(id)
              }}
              editing={updateMutation.isPending && editDialog === id}
              onDelete={() => setDeleteDialog(id)}
              deleting={deleteMutation.isPending && deleteDialog === id}
            />
          )
        })}
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

      {/* Apply Binding Dialog */}
      <Dialog open={!!applyDialog} onOpenChange={open => {
        if (!open && !applyBindingMutation.isPending) {
          setApplyDialog(null)
          setApplyResult(null)
        }
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save + Apply Agent</DialogTitle>
          </DialogHeader>
          {applyDialog && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">LINE OA</p>
                <p className="font-mono text-sm">{applyDialog.accountId}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <div className="rounded-md border bg-white p-2 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">เดิม</p>
                    <p className="font-medium">{applyDialog.oldAgentId || 'ไม่ได้ผูก'}</p>
                  </div>
                  <span className="text-zinc-400">→</span>
                  <div className="rounded-md border bg-white p-2 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">ใหม่</p>
                    <p className="font-medium">{applyDialog.newAgentId}</p>
                  </div>
                </div>
              </div>

              {!applyResult && (
                <>
                  <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={applyResetSessions}
                      disabled={applyBindingMutation.isPending}
                      onChange={event => setApplyResetSessions(event.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Reset session ของ LINE นี้</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        ล้างเฉพาะ session ของ channel นี้ใน agent เดิมและ agent ใหม่ ไม่แตะ webchat หรือ channel อื่น
                      </span>
                    </span>
                  </label>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    Gateway จะ restart เพื่อให้ route ใหม่มีผล อาจหยุดตอบไม่กี่วินาที
                  </div>
                </>
              )}

              {applyBindingMutation.isPending && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">กำลัง Apply...</p>
                  <ol className="mt-2 space-y-1 text-xs text-zinc-500">
                    <li>1. Saving binding</li>
                    <li>2. Resetting sessions</li>
                    <li>3. Restarting gateway</li>
                    <li>4. Ready to test</li>
                  </ol>
                </div>
              )}

              {applyResult && <ChannelApplyResultPanel result={applyResult} />}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={applyBindingMutation.isPending}
              onClick={() => {
                setApplyDialog(null)
                setApplyResult(null)
              }}
            >
              {applyResult ? 'Close' : 'Cancel'}
            </Button>
            {applyDialog && !applyResult && (
              <Button
                disabled={applyBindingMutation.isPending}
                onClick={() => applyBindingMutation.mutate({
                  accountId: applyDialog.accountId,
                  agentId: applyDialog.newAgentId,
                  resetSessions: applyResetSessions,
                })}
              >
                {applyBindingMutation.isPending ? 'Applying...' : 'Save + Apply'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={open => { if (!open) setEditDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไข LINE OA: {editDialog}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Webhook Path</p>
              <Input
                placeholder="/line/webhook/sale"
                value={editWebhookPath}
                onChange={e => setEditWebhookPath(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Channel Access Token</p>
              <p className="text-xs text-zinc-500">เว้นว่างถ้าไม่ต้องการเปลี่ยน</p>
              <div className="flex gap-2">
                <Input
                  type={showEditToken ? 'text' : 'password'}
                  placeholder="ไม่เปลี่ยน"
                  value={editToken}
                  onChange={e => setEditToken(e.target.value)}
                  className="font-mono flex-1"
                />
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowEditToken(v => !v)}>
                  {showEditToken ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Channel Secret</p>
              <p className="text-xs text-zinc-500">เว้นว่างถ้าไม่ต้องการเปลี่ยน</p>
              <div className="flex gap-2">
                <Input
                  type={showEditSecret ? 'text' : 'password'}
                  placeholder="ไม่เปลี่ยน"
                  value={editSecret}
                  onChange={e => setEditSecret(e.target.value)}
                  className="font-mono flex-1"
                />
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowEditSecret(v => !v)}>
                  {showEditSecret ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
