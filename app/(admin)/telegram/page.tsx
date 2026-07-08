'use client'

import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConfig,
  putConfig,
  getUserNames,
  addTelegramAccount,
  deleteTelegramAccount,
  restartGateway,
  getTelegramBotInfo,
  getTelegramBindings,
  setTelegramBinding,
  setTelegramDefault,
  getAgents,
  applyChannelBinding,
  getAgentBrainChannelPolicies,
  putAgentBrainChannelPolicy,
  type AgentBrainAudience,
  type AgentBrainChannelPolicy,
  type ChannelBindingApplyResult,
} from '@/lib/api'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface AccountState {
  botToken: string
  dmPolicy: string
  allowFrom: (number | string)[]
  showToken: boolean
}


function AccountCard({
  accountId,
  label,
  state,
  userNames,
  onChange,
  onSave,
  saving,
  boundAgentId,
  agents,
  bindingSaving,
  onDelete,
  deleting,
  onSetDefault,
  settingDefault,
  selectedAgentId,
  pendingRestart,
  onSelectAgent,
  onSaveApply,
  onSaveOnly,
  onCancelBindingChange,
  brainPolicy,
  brainPolicySaving,
  onUpdateBrainPolicy,
}: {
  accountId: string
  label: string
  state: AccountState
  userNames: Record<string, string>
  onChange: (patch: Partial<AccountState>) => void
  onSave: () => void
  saving: boolean
  boundAgentId: string
  agents: { id: string }[]
  bindingSaving: boolean
  onDelete?: () => void
  deleting?: boolean
  onSetDefault?: () => void
  settingDefault?: boolean
  selectedAgentId: string
  pendingRestart: boolean
  onSelectAgent: (agentId: string) => void
  onSaveApply: () => void
  onSaveOnly: () => void
  onCancelBindingChange: () => void
  brainPolicy: AgentBrainChannelPolicy
  brainPolicySaving: boolean
  onUpdateBrainPolicy: (patch: Partial<Pick<AgentBrainChannelPolicy, 'audience' | 'showDescriptionSuggestions' | 'enabled'>>) => void
}) {
  const hasBindingChange = selectedAgentId !== (boundAgentId || '')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-base">{label}</CardTitle>
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
            {onSetDefault && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={settingDefault}
                onClick={onSetDefault}
              >
                {settingDefault ? 'Setting...' : 'Set as Default'}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="text-xs"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? 'Deleting...' : 'Delete Bot'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agent Binding */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Agent</p>
          <p className="text-xs text-zinc-500">ข้อความที่ส่งมาจาก bot นี้จะถูก route ไปยัง agent ที่เลือก</p>
          <div className="flex gap-2 items-center">
            <Select value={selectedAgentId || '__none__'} onValueChange={v => onSelectAgent(v === '__none__' ? '' : v ?? '')}>
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
                  Save + Apply จะ reset session ของ Telegram bot นี้ และ restart gateway ให้พร้อมทดสอบ
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
            <p className="text-xs text-amber-600 dark:text-amber-400">⚠ ยังไม่ได้ผูก Agent — bot จะ fallback ไปยัง default agent แทน</p>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Agent Brain Audience</p>
          <p className="text-xs text-zinc-500">
            ใช้กำหนดว่า bot นี้คุยกับลูกค้าหรือ staff เพื่อควบคุมคำแนะนำเติม SML description
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={brainPolicy.audience}
              onValueChange={value => onUpdateBrainPolicy({
                audience: value as AgentBrainAudience,
                showDescriptionSuggestions: value === 'customer' ? false : brainPolicy.showDescriptionSuggestions,
              })}
            >
              <SelectTrigger className="w-44" aria-label="Agent Brain audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={brainPolicy.showDescriptionSuggestions}
                disabled={brainPolicySaving || brainPolicy.audience === 'customer'}
                onChange={event => onUpdateBrainPolicy({ showDescriptionSuggestions: event.target.checked })}
              />
              Show SML description suggestions
            </label>
            {brainPolicySaving ? <span className="text-xs text-zinc-400">Saving...</span> : null}
          </div>
          <p className="text-xs text-zinc-400">
            Customer bot จะไม่เห็นคำแนะนำหลังบ้าน ส่วน Staff/Internal เปิดได้เมื่อใช้เพื่อสอนข้อมูลสินค้า
          </p>
        </div>

        <Separator />

        {/* Bot Token */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Bot Token</p>
          <div className="flex gap-2">
            <Input
              type={state.showToken ? 'text' : 'password'}
              value={state.botToken}
              onChange={e => onChange({ botToken: e.target.value })}
              placeholder="123456:ABC-DEF..."
              className="font-mono"
            />
            <Button variant="outline" size="sm" onClick={() => onChange({ showToken: !state.showToken })}>
              {state.showToken ? 'Hide' : 'Show'}
            </Button>
          </div>
        </div>

        <Separator />

        {/* DM Policy */}
        <div className="space-y-1">
          <p className="text-sm font-medium">DM Policy</p>
          <p className="text-xs text-zinc-500">
            <span className="font-medium">open</span>: รับจากทุกคน,{' '}
            <span className="font-medium">allowlist</span>: รับเฉพาะ user ที่เพิ่มไว้ใน Agents → Users
          </p>
          <Select
            value={state.dmPolicy}
            onValueChange={v => {
              if (!v) return
              const realUsers = state.allowFrom.filter(id => String(id) !== '*')
              if (v === 'allowlist' && realUsers.length === 0) {
                onChange({ dmPolicy: v })
                return
              }
              onChange({ dmPolicy: v })
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">open</SelectItem>
              <SelectItem value="allowlist">allowlist</SelectItem>
            </SelectContent>
          </Select>
          {state.dmPolicy === 'allowlist' && state.allowFrom.filter(id => String(id) !== '*').length === 0 && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 p-3 text-sm space-y-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-300">ยังไม่มี User ในรายการ</p>
              <p className="text-yellow-700 dark:text-yellow-400 text-xs">dmPolicy=allowlist ต้องมี User อย่างน้อย 1 คน มิฉะนั้น gateway จะ invalid</p>
              {boundAgentId ? (
                <Link href={`/agents/${boundAgentId}`} className="inline-block mt-1 text-xs font-medium text-yellow-800 dark:text-yellow-300 underline underline-offset-2">
                  → ไปเพิ่ม User ที่ Agents → {boundAgentId}
                </Link>
              ) : (
                <Link href="/agents" className="inline-block mt-1 text-xs font-medium text-yellow-800 dark:text-yellow-300 underline underline-offset-2">
                  → ไปผูก Agent และเพิ่ม User ที่หน้า Agents
                </Link>
              )}
            </div>
          )}
        </div>

        {(() => {
          const realUsers = state.allowFrom.filter(id => String(id) !== '*')
          if (realUsers.length === 0 || state.dmPolicy === 'open') return null
          return (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Users ที่อนุญาต</p>
                  {boundAgentId && (
                    <Link href={`/agents/${boundAgentId}`} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2">
                      จัดการที่ Agents → {boundAgentId}
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {realUsers.map(id => (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {userNames[String(id)] ? `${userNames[String(id)]} (${id})` : String(id)}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )
        })()}

        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : `Save ${label}`}
        </Button>
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
          <p>ข้อความถัดไปใน Telegram จะใช้ agent ใหม่แล้ว ถ้าต้องการตรวจเองให้ถาม: คุณคือ agent อะไร มี tools อะไรบ้าง</p>
        </div>
      )}
    </div>
  )
}

export default function TelegramPage() {
  const qc = useQueryClient()
  const [accounts, setAccounts] = useState<Record<string, AccountState>>({})
  const [newAccountId, setNewAccountId] = useState('')
  const [newToken, setNewToken] = useState('')
  const [setDefaultDialog, setSetDefaultDialog] = useState<{ accountId: string } | null>(null)
  const [oldAccountIdInput, setOldAccountIdInput] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)
  const [draftBindings, setDraftBindings] = useState<Record<string, string>>({})
  const [savedOnlyBindings, setSavedOnlyBindings] = useState<Record<string, boolean>>({})
  const [applyDialog, setApplyDialog] = useState<{ accountId: string; oldAgentId: string | null; newAgentId: string } | null>(null)
  const [applyResetSessions, setApplyResetSessions] = useState(true)
  const [applyResult, setApplyResult] = useState<ChannelBindingApplyResult | null>(null)

  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: userNames = {} } = useQuery({ queryKey: ['usernames'], queryFn: getUserNames })
  const { data: botInfo = {} } = useQuery({ queryKey: ['telegram-botinfo'], queryFn: getTelegramBotInfo })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: routeBindings = [] } = useQuery({ queryKey: ['telegram-bindings'], queryFn: getTelegramBindings })
  const { data: brainPoliciesData } = useQuery({
    queryKey: ['agent-brain-channel-policies', 'telegram'],
    queryFn: () => getAgentBrainChannelPolicies({ channel: 'telegram' }),
    retry: false,
  })

  // Build accounts state from config
  useEffect(() => {
    if (!config?.channels?.telegram) return
    const tg = config.channels.telegram
    const next: Record<string, AccountState> = {}

    // OpenClaw v2026.3.13: botToken อยู่ใน accounts.* เสมอ
    // ถ้ายังมี top-level botToken (format เก่า) ให้ใช้เป็น fallback
    // top-level allowFrom อาจมี user IDs จริง (format เก่า) — merge เข้า accounts
    const topAllowFrom = (tg.allowFrom ?? []).filter((id: number | string) => String(id) !== '*')

    for (const [id, acc] of Object.entries(tg.accounts ?? {})) {
      const accAllowFrom = (acc.allowFrom ?? []).filter((uid: number | string) => String(uid) !== '*')
      // merge top-level allowFrom เข้าด้วยถ้าเป็น default account
      const merged = id === 'default'
        ? [...new Set([...accAllowFrom, ...topAllowFrom])]
        : accAllowFrom
      next[id] = {
        botToken: acc.botToken ?? '',
        dmPolicy: acc.dmPolicy ?? tg.dmPolicy ?? 'allowlist',
        allowFrom: merged as number[],
        showToken: false,
      }
    }

    // fallback: ถ้าไม่มี accounts.default แต่มี top-level botToken
    if (!next['default'] && tg.botToken) {
      next['default'] = {
        botToken: tg.botToken,
        dmPolicy: tg.dmPolicy ?? 'allowlist',
        allowFrom: tg.allowFrom ?? [],
        showToken: false,
      }
    }

    // Rehydrate the editable form from the server config while preserving local token visibility.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccounts(prev => {
      // preserve showToken state
      const merged: Record<string, AccountState> = {}
      for (const [id, state] of Object.entries(next)) {
        merged[id] = { ...state, showToken: prev[id]?.showToken ?? false }
      }
      return merged
    })
  }, [config])

  const [savingAccountId, setSavingAccountId] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async (accountId: string) => {
      setSavingAccountId(accountId)
      // refetch config ใหม่ก่อน save เพื่อไม่ overwrite binding ที่เพิ่งเซฟไป
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: getConfig })
      if (!fresh) return
      const tg = { ...fresh.channels?.telegram }
      const state = accounts[accountId]

      // dmPolicy='open' ต้องมี '*' ใน allowFrom เสมอ
      const allowFrom = state.dmPolicy === 'open'
        ? ['*']
        : state.allowFrom.filter((id: number | string) => String(id) !== '*')

      // OpenClaw v2026.3.13: เขียนลง accounts.* เสมอ
      if (!tg.accounts) tg.accounts = {}
      tg.accounts = {
        ...tg.accounts,
        [accountId]: {
          ...tg.accounts[accountId],
          botToken: state.botToken,
          dmPolicy: state.dmPolicy,
          allowFrom,
        },
      }
      // ลบ top-level botToken/dmPolicy/allowFrom ออก (format เก่า)
      delete (tg as Record<string, unknown>).botToken
      delete (tg as Record<string, unknown>).allowFrom

      await putConfig({ ...fresh, channels: { ...fresh.channels, telegram: tg } })
    },
    onSuccess: () => {
      setSavingAccountId(null)
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('บันทึกสำเร็จ')
    },
    onError: () => { setSavingAccountId(null); toast.error('บันทึกไม่สำเร็จ') },
  })

  const addAccountMutation = useMutation({
    mutationFn: () => addTelegramAccount(newAccountId.trim(), newToken.trim()),
    onSuccess: async () => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success('Bot added — gateway restarted', { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['config'] })
      setNewAccountId('')
      setNewToken('')
    },
    onError: () => toast.error('Failed to add bot'),
  })


  const bindMutation = useMutation({
    mutationFn: ({ accountId, agentId }: { accountId: string; agentId: string }) =>
      setTelegramBinding(accountId, agentId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['telegram-bindings'] })
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
      applyChannelBinding({ channel: 'telegram', accountId, agentId, resetSessions, restartGateway: true }),
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
      qc.invalidateQueries({ queryKey: ['telegram-bindings'] })
      toast.success('Agent binding applied')
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: ChannelBindingApplyResult } })?.response?.data
      if (data) setApplyResult(data)
      toast.error(data?.safeMessage || 'Failed to apply binding')
    },
  })

  const brainPolicyMutation = useMutation({
    mutationFn: ({ accountId, patch }: { accountId: string; patch: Partial<Pick<AgentBrainChannelPolicy, 'audience' | 'showDescriptionSuggestions' | 'enabled'>> }) =>
      putAgentBrainChannelPolicy('telegram', accountId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-brain-channel-policies', 'telegram'] })
      toast.success('บันทึก Agent Brain channel policy แล้ว')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'บันทึก Agent Brain policy ไม่สำเร็จ'),
  })

  const setDefaultMutation = useMutation({
    mutationFn: ({ accountId, oldAccountId }: { accountId: string; oldAccountId: string }) =>
      setTelegramDefault(accountId, oldAccountId),
    onSuccess: async () => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success('Default bot updated — gateway restarted', { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['telegram-botinfo'] })
      qc.invalidateQueries({ queryKey: ['telegram-bindings'] })
    },
    onError: () => toast.error('Failed to set default'),
  })

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteTelegramAccount(accountId),
    onSuccess: async (_, accountId) => {
      toast.loading('Restarting gateway...', { id: 'restart' })
      try { await restartGateway() } catch {}
      toast.success(`Bot "${accountId}" deleted — gateway restarted`, { id: 'restart' })
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['telegram-botinfo'] })
      qc.invalidateQueries({ queryKey: ['telegram-bindings'] })
    },
    onError: () => toast.error('Failed to delete bot'),
  })

  function patchAccount(id: string, patch: Partial<AccountState>) {
    setAccounts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  if (isLoading) return <p className="text-sm text-zinc-400">Loading...</p>

  const accountIds = Object.keys(accounts)

  const existingAccountIds = Object.keys(accounts)
  const addIdError = newAccountId.trim() === 'default'
    ? 'ห้ามใช้ชื่อ "default"'
    : existingAccountIds.includes(newAccountId.trim()) && newAccountId.trim()
    ? 'Account ID นี้มีอยู่แล้ว'
    : ''
  const tokenFormatError = newToken.trim() && !/^\d+:[A-Za-z0-9_-]+$/.test(newToken.trim())
    ? 'Token format ไม่ถูกต้อง — ต้องเป็น 1234567890:AAAA...'
    : ''

  const telegramEnabled = config?.channels?.telegram?.enabled ?? false

  function openApplyBinding(accountId: string, newAgentId: string, oldAgentId: string | null) {
    if (!newAgentId) {
      toast.error('เลือก Agent ก่อน Apply')
      return
    }
    setApplyDialog({ accountId, oldAgentId, newAgentId })
    setApplyResetSessions(true)
    setApplyResult(null)
  }

  async function handleEnableTelegram() {
    const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: getConfig })
    if (!fresh) return
    const tg = { ...fresh.channels?.telegram, enabled: true }
    await putConfig({ ...fresh, channels: { ...fresh.channels, telegram: tg } })
    qc.invalidateQueries({ queryKey: ['config'] })
    toast.loading('กำลัง Restart Gateway...', { id: 'tg-enable' })
    try {
      await restartGateway()
      toast.success('เปิดใช้งาน Telegram แล้ว — Gateway restarted', { id: 'tg-enable' })
    } catch {
      toast.error('เปิดใช้งานแล้ว แต่ Restart Gateway ไม่สำเร็จ — ลอง Restart จาก Dashboard', { id: 'tg-enable' })
    }
    setTimeout(() => qc.invalidateQueries({ queryKey: ['status'] }), 3000)
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Telegram</h1>
        <p className="text-sm text-zinc-500 mt-1">ตั้งค่า Telegram Bot — รองรับหลาย bot account</p>
      </div>

      {/* Telegram disabled warning */}
      {!telegramEnabled && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Telegram ยังไม่ได้เปิดใช้งาน</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">Bot จะไม่รับข้อความจาก Telegram จนกว่าจะเปิดใช้งาน</p>
          </div>
          <Button size="sm" onClick={handleEnableTelegram} className="shrink-0 bg-yellow-600 hover:bg-yellow-700 text-white">
            เปิดใช้งาน Telegram
          </Button>
        </div>
      )}

      {/* How it works */}
      <Card className="border-zinc-200 bg-zinc-50 dark:bg-zinc-900">
        <CardContent className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">วิธีใช้งาน</p>
          <p>1. <span className="font-medium">เพิ่ม Bot</span> — กรอก Account ID (ชื่อสั้นๆ เช่น <span className="font-mono">stock</span>) และ Token จาก @BotFather</p>
          <p>2. <span className="font-medium">ผูก Agent</span> — เลือก Agent ที่จะรับข้อความจาก bot นั้น</p>
          <p>3. <span className="font-medium">Default Bot</span> — ลบตรงๆ ไม่ได้ ต้องกด <span className="font-medium">Set as Default</span> บน bot อื่นก่อน แล้วค่อยลบ default เดิม</p>
          <p>4. <span className="font-medium">Set as Default</span> — ระบบจะถามชื่อสำหรับ default เดิม (เพื่อย้ายออกเป็น named account) ห้ามใช้ชื่อ <span className="font-mono">&quot;default&quot;</span></p>
        </CardContent>
      </Card>

      {/* Add new bot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">เพิ่ม Bot ใหม่</CardTitle>
          <p className="text-xs text-zinc-500 mt-1">สร้าง bot ใหม่จาก @BotFather แล้วนำ token มาใส่ที่นี่</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Account ID เช่น stock, hr"
              value={newAccountId}
              onChange={e => setNewAccountId(e.target.value)}
              className={`w-40 ${addIdError ? 'border-red-400' : ''}`}
            />
            <Input
              placeholder="Bot Token จาก BotFather"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              className="font-mono flex-1"
            />
            <Button
              onClick={() => addAccountMutation.mutate()}
              disabled={addAccountMutation.isPending || !newAccountId.trim() || !newToken.trim() || !!addIdError || !!tokenFormatError}
            >
              {addAccountMutation.isPending ? 'Adding...' : 'Add Bot'}
            </Button>
          </div>
          {addIdError && <p className="text-xs text-red-500">{addIdError}</p>}
          {tokenFormatError && <p className="text-xs text-red-500">{tokenFormatError}</p>}
        </CardContent>
      </Card>

      <Separator />

      {accountIds.length === 0 && (
        <p className="text-sm text-zinc-400">ไม่พบ Telegram config</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {accountIds.map(id => {
          const boundAgentId = routeBindings.find(b => b.accountId === id)?.agentId ?? ''
          const selectedAgentId = draftBindings[id] ?? boundAgentId
          const brainPolicy = brainPoliciesData?.policies.find(policy => policy.channel === 'telegram' && policy.accountId === id) || {
            channel: 'telegram',
            accountId: id,
            audience: 'customer' as AgentBrainAudience,
            showDescriptionSuggestions: false,
            enabled: true,
          }
          return (
            <AccountCard
              key={id}
              accountId={id}
              label={botInfo[id] ?? (id === 'default' ? 'Default Bot' : `Bot: ${id}`)}
              state={accounts[id]}
              userNames={userNames}
              onChange={patch => patchAccount(id, patch)}
              onSave={() => saveMutation.mutate(id)}
              saving={savingAccountId === id}
              boundAgentId={boundAgentId}
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
              brainPolicy={brainPolicy}
              brainPolicySaving={brainPolicyMutation.isPending}
              onUpdateBrainPolicy={patch => brainPolicyMutation.mutate({ accountId: id, patch })}
              bindingSaving={bindMutation.isPending || applyBindingMutation.isPending}
              onDelete={id === 'default' ? undefined : () => setDeleteDialog(id)}
              deleting={deleteMutation.isPending}
              onSetDefault={id === 'default' ? undefined : () => setSetDefaultDialog({ accountId: id })}
              settingDefault={setDefaultMutation.isPending}
            />
          )
        })}
      </div>

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
                <p className="text-xs text-zinc-500">Telegram Bot</p>
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
                      <span className="font-medium">Reset session ของ Telegram bot นี้</span>
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

      {/* Delete Bot Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ Bot</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ต้องการลบ bot <span className="font-medium">{deleteDialog ? (botInfo[deleteDialog] ?? deleteDialog) : ''}</span> ออกจากระบบ?
          </p>
          <p className="text-xs text-zinc-500">Bot จะหยุดตอบทันทีหลัง restart gateway — chat ใน Telegram ยังอยู่ครบ</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteDialog) {
                  deleteMutation.mutate(deleteDialog)
                  setDeleteDialog(null)
                }
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Bot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set as Default Dialog */}
      <Dialog open={!!setDefaultDialog} onOpenChange={open => { if (!open) { setSetDefaultDialog(null); setOldAccountIdInput('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สลับ Default Bot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border p-3 text-sm space-y-1 text-zinc-600 dark:text-zinc-400">
              <p>Bot <span className="font-medium text-zinc-900 dark:text-zinc-100">{setDefaultDialog ? (botInfo[setDefaultDialog.accountId] ?? setDefaultDialog.accountId) : ''}</span> จะขึ้นเป็น <span className="font-medium">Default</span></p>
              <p>Default Bot เดิม <span className="font-medium text-zinc-900 dark:text-zinc-100">({botInfo['default'] ?? 'Default Bot'})</span> จะถูกย้ายออกเป็น named account</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">ตั้งชื่อ Account ID ให้ Default Bot เดิม</p>
              <p className="text-xs text-zinc-500">ชื่อสั้นๆ ภาษาอังกฤษ เช่น <span className="font-mono">sale</span>, <span className="font-mono">hr</span> — ห้ามใช้ชื่อ <span className="font-mono">default</span></p>
              <Input
                placeholder='เช่น sale, hr'
                value={oldAccountIdInput}
                onChange={e => setOldAccountIdInput(e.target.value)}
                autoFocus
              />
              {oldAccountIdInput.trim() === 'default' && (
                <p className="text-xs text-red-500">ห้ามใช้ชื่อ &quot;default&quot;</p>
              )}
              {oldAccountIdInput.trim() && existingAccountIds.includes(oldAccountIdInput.trim()) && oldAccountIdInput.trim() !== 'default' && (
                <p className="text-xs text-red-500">ชื่อนี้มีอยู่แล้ว</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSetDefaultDialog(null); setOldAccountIdInput('') }}>Cancel</Button>
            <Button
              disabled={!oldAccountIdInput.trim() || oldAccountIdInput.trim() === 'default' || existingAccountIds.includes(oldAccountIdInput.trim()) || setDefaultMutation.isPending}
              onClick={() => {
                if (setDefaultDialog) {
                  setDefaultMutation.mutate({ accountId: setDefaultDialog.accountId, oldAccountId: oldAccountIdInput.trim() })
                  setSetDefaultDialog(null)
                  setOldAccountIdInput('')
                }
              }}
            >
              {setDefaultMutation.isPending ? 'Setting...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
