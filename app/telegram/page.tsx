'use client'

import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, putConfig, getUserNames, addTelegramAccount, deleteTelegramAccount, restartGateway, getTelegramBotInfo, getTelegramBindings, setTelegramBinding, setTelegramDefault, getAgents } from '@/lib/api'
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
  onBindAgent,
  bindingSaving,
  onDelete,
  deleting,
  onSetDefault,
  settingDefault,
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
  onBindAgent: (agentId: string) => void
  bindingSaving: boolean
  onDelete?: () => void
  deleting?: boolean
  onSetDefault?: () => void
  settingDefault?: boolean
}) {
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
            <Select value={boundAgentId || '__none__'} onValueChange={v => onBindAgent(v === '__none__' ? '' : v ?? '')}>
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
            <p className="text-xs text-amber-600 dark:text-amber-400">⚠ ยังไม่ได้ผูก Agent — bot จะ fallback ไปยัง default agent แทน</p>
          )}
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

export default function TelegramPage() {
  const qc = useQueryClient()
  const [accounts, setAccounts] = useState<Record<string, AccountState>>({})
  const [newAccountId, setNewAccountId] = useState('')
  const [newToken, setNewToken] = useState('')
  const [setDefaultDialog, setSetDefaultDialog] = useState<{ accountId: string } | null>(null)
  const [oldAccountIdInput, setOldAccountIdInput] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null)

  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: userNames = {} } = useQuery({ queryKey: ['usernames'], queryFn: getUserNames })
  const { data: botInfo = {} } = useQuery({ queryKey: ['telegram-botinfo'], queryFn: getTelegramBotInfo })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: routeBindings = [] } = useQuery({ queryKey: ['telegram-bindings'], queryFn: getTelegramBindings })

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

    setAccounts(prev => {
      // preserve showToken state
      const merged: Record<string, AccountState> = {}
      for (const [id, state] of Object.entries(next)) {
        merged[id] = { ...state, showToken: prev[id]?.showToken ?? false }
      }
      return merged
    })
  }, [config])

  const saveMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!config) return
      const tg = { ...config.channels?.telegram }
      const state = accounts[accountId]

      // OpenClaw v2026.3.13: เขียนลง accounts.* เสมอ
      if (!tg.accounts) tg.accounts = {}
      tg.accounts = {
        ...tg.accounts,
        [accountId]: {
          ...tg.accounts[accountId],
          botToken: state.botToken,
          dmPolicy: state.dmPolicy,
          allowFrom: state.allowFrom,
        },
      }
      // ลบ top-level botToken/dmPolicy/allowFrom ออก (format เก่า)
      delete (tg as Record<string, unknown>).botToken
      delete (tg as Record<string, unknown>).allowFrom

      await putConfig({ ...config, channels: { ...config.channels, telegram: tg } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('Saved')
    },
    onError: () => toast.error('Failed to save'),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telegram-bindings'] })
      toast.success('Agent binding saved')
    },
    onError: () => toast.error('Failed to save binding'),
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

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Telegram</h1>
        <p className="text-sm text-zinc-500 mt-1">ตั้งค่า Telegram Bot — รองรับหลาย bot account</p>
      </div>

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
              disabled={addAccountMutation.isPending || !newAccountId.trim() || !newToken.trim() || !!addIdError}
            >
              {addAccountMutation.isPending ? 'Adding...' : 'Add Bot'}
            </Button>
          </div>
          {addIdError && <p className="text-xs text-red-500">{addIdError}</p>}
        </CardContent>
      </Card>

      <Separator />

      {accountIds.length === 0 && (
        <p className="text-sm text-zinc-400">ไม่พบ Telegram config</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {accountIds.map(id => (
          <AccountCard
            key={id}
            accountId={id}
            label={botInfo[id] ?? (id === 'default' ? 'Default Bot' : `Bot: ${id}`)}
            state={accounts[id]}
            userNames={userNames}
            onChange={patch => patchAccount(id, patch)}
            onSave={() => saveMutation.mutate(id)}
            saving={saveMutation.isPending}
            boundAgentId={routeBindings.find(b => b.accountId === id)?.agentId ?? ''}
            agents={agents}
            onBindAgent={agentId => bindMutation.mutate({ accountId: id, agentId })}
            bindingSaving={bindMutation.isPending}
            onDelete={id === 'default' ? undefined : () => setDeleteDialog(id)}
            deleting={deleteMutation.isPending}
            onSetDefault={id === 'default' ? undefined : () => setSetDefaultDialog({ accountId: id })}
            settingDefault={setDefaultMutation.isPending}
          />
        ))}
      </div>

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
