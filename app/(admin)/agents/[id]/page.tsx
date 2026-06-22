'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAgentSoul, putAgentSoul,
  getAgentMcp, putAgentMcp,
  getAgentUsers, addAgentUser, deleteAgentUser,
  restartGateway, testAgentMcp, getAgentSoulTemplate, resetAgentSessions,
  getAgentBusinessProfile,
  type AgentSoulTemplate, type McpConfig, type McpTool,
} from '@/lib/api'
import { useState, useEffect, use } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

// ── Soul Panel ────────────────────────────────────────────
const PERSONAS = [
  { value: 'professional', label: 'ทางการ',     desc: 'สุภาพ กระชับ ตรงประเด็น ไม่มีอีโมจิ' },
  { value: 'friendly',     label: 'เป็นกันเอง',  desc: 'ภาษาพูด อบอุ่น มีอีโมจิเล็กน้อย' },
  { value: 'cheerful',     label: 'สดใส',        desc: 'กระตือรือร้น ให้กำลังใจ มีอีโมจิ' },
  { value: 'strict',       label: 'เน้นข้อมูล',  desc: 'ข้อมูลล้วน ไม่คุย off-topic' },
]

const DEFAULT_MCP_URL = 'http://192.168.2.248:3515/sse'
const ACCESS_MODES = [
  { value: 'admin',    label: 'admin',    desc: 'เห็นทุกอย่าง รวมถึงรายงานและวิเคราะห์' },
  { value: 'sales',    label: 'sales',    desc: 'แผนกขาย' },
  { value: 'purchase', label: 'purchase', desc: 'แผนกจัดซื้อ' },
  { value: 'stock',    label: 'stock',    desc: 'แผนกคลังสินค้า' },
  { value: 'general',  label: 'general',  desc: 'ทั่วไป (ค่าเริ่มต้น)' },
]

const LEGACY_SOUL_PATTERNS = [
  { label: 'curl', re: /\bcurl\b/i },
  { label: '/call', re: /\/call\b/i },
  { label: 'exec tool', re: /exec\s+tool/i },
  { label: 'mcporter', re: /mcporter/i },
]

function defaultAccessMode(agentId: string) {
  return ACCESS_MODES.some(m => m.value === agentId) ? agentId : 'general'
}

function findLegacySoulPatterns(text: string) {
  return LEGACY_SOUL_PATTERNS.filter(p => p.re.test(text)).map(p => p.label)
}

function lineCount(text: string) {
  return text ? text.split('\n').length : 0
}

interface SoulContract {
  version?: string
  accessMode?: string
  toolSource?: string
  generatedAt?: string
  allowedTools?: string[]
  allowedToolsHash?: string
}

function extractSoulContract(text: string): SoulContract | null {
  const match = text.match(/OPENCLAW_SOUL_CONTRACT\s+({[\s\S]*?})\s*-->/)
  if (!match) return null
  try { return JSON.parse(match[1]) as SoulContract } catch { return null }
}

function contractChanged(current: SoulContract | null, next: SoulContract | null) {
  if (!next) return false
  if (!current) return true
  return current.version !== next.version ||
    current.accessMode !== next.accessMode ||
    current.allowedToolsHash !== next.allowedToolsHash ||
    current.toolSource !== next.toolSource
}

function contractLabel(contract: SoulContract | null) {
  if (!contract) return 'no contract'
  const count = contract.allowedTools?.length ?? 0
  return `${contract.accessMode ?? 'unknown'} · ${contract.toolSource ?? 'unknown'} · ${count} tools · ${contract.allowedToolsHash ?? 'no hash'}`
}

function diffSummary(currentText: string, nextText: string, currentContract: SoulContract | null, nextContract: SoulContract | null) {
  const currentSections = new Set(Array.from(currentText.matchAll(/^##\s+(.+)$/gm)).map(m => m[1].trim()))
  const nextSections = new Set(Array.from(nextText.matchAll(/^##\s+(.+)$/gm)).map(m => m[1].trim()))
  const added = [...nextSections].filter(s => !currentSections.has(s))
  const removed = [...currentSections].filter(s => !nextSections.has(s))
  const lineDelta = lineCount(nextText) - lineCount(currentText)
  const changed = contractChanged(currentContract, nextContract)
  return { added, removed, lineDelta, contractChanged: changed }
}

function SoulPanel({ agentId }: { agentId: string }) {
  const qc = useQueryClient()
  const [soul, setSoul] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [persona, setPersona] = useState('professional')
  const [pendingTemplate, setPendingTemplate] = useState<(AgentSoulTemplate & { personaLabel: string }) | null>(null)
  const [resetSessionsAfterSave, setResetSessionsAfterSave] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['soul', agentId],
    queryFn: () => getAgentSoul(agentId),
  })
  const { data: businessProfileState } = useQuery({
    queryKey: ['agent-business-profile', agentId],
    queryFn: () => getAgentBusinessProfile(agentId),
  })

  useEffect(() => {
    if (data !== undefined) {
      setSoul(data)
      setDirty(false)
      // detect persona from saved SOUL text
      if (data.includes('ตอบเป็นกันเอง')) setPersona('friendly')
      else if (data.includes('ตอบสดใส')) setPersona('cheerful')
      else if (data.includes('ตอบข้อมูลล้วน')) setPersona('strict')
      else if (data.includes('ตอบสุภาพ ทางการ')) setPersona('professional')
    }
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      await putAgentSoul(agentId, soul)
      if (!resetSessionsAfterSave) return { reset: null }
      const reset = await resetAgentSessions(agentId)
      await restartGateway()
      return { reset }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['soul', agentId] })
      qc.invalidateQueries({ queryKey: ['agent-business-profile', agentId] })
      setDirty(false)
      setResetSessionsAfterSave(false)
      if (result.reset) {
        toast.success(`SOUL saved — reset ${result.reset.removed} session(s) และ restart gateway แล้ว`)
      } else {
        toast.success('SOUL saved')
      }
    },
    onError: () => toast.error('Failed to save SOUL'),
  })

  async function loadTemplate(refreshTools = false) {
    setLoadingTemplate(true)
    try {
      const data = await getAgentSoulTemplate(agentId, persona, refreshTools)
      const personaLabel = PERSONAS.find(p => p.value === persona)?.label ?? persona
      setPendingTemplate({ ...data, personaLabel })
    } catch {
      toast.error('Failed to load template')
    } finally {
      setLoadingTemplate(false)
    }
  }

  function applyPendingTemplate() {
    if (!pendingTemplate) return
    const shouldReset = contractChanged(extractSoulContract(soul), extractSoulContract(pendingTemplate.soul))
    setSoul(pendingTemplate.soul)
    setDirty(true)
    setResetSessionsAfterSave(shouldReset)
    toast.success(`Template applied — mode "${pendingTemplate.accessMode}" / บุคลิก "${pendingTemplate.personaLabel}" — กด Save เพื่อบันทึก`)
    setPendingTemplate(null)
  }

  const legacyPatterns = findLegacySoulPatterns(soul)
  const pendingLegacyPatterns = pendingTemplate ? findLegacySoulPatterns(pendingTemplate.soul) : []
  const currentLines = lineCount(soul)
  const nextLines = pendingTemplate ? lineCount(pendingTemplate.soul) : 0
  const currentContract = extractSoulContract(soul)
  const pendingContract = pendingTemplate ? extractSoulContract(pendingTemplate.soul) : null
  const pendingDiff = pendingTemplate ? diffSummary(soul, pendingTemplate.soul, currentContract, pendingContract) : null
  const linkedBusinessProfile = businessProfileState?.profile ?? null
  const businessProfileApplied = businessProfileState?.isApplied ?? false

  return (
    <>
      <Card className="flex flex-col h-full">
        <CardHeader className="pb-2 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">SOUL</CardTitle>
              <p className="text-xs text-zinc-500 mt-0.5">System prompt ที่กำหนดบุคลิก ขอบเขต และพฤติกรรมของ agent</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {dirty && <Badge variant="outline" className="text-amber-600 border-amber-400">Unsaved</Badge>}
              {linkedBusinessProfile && (
                <Badge variant={businessProfileApplied ? 'secondary' : 'destructive'}>
                  {businessProfileApplied ? 'Business Profile applied' : 'Business Profile changed'}
                </Badge>
              )}
              <div className="flex items-center gap-1.5">
                <select
                  value={persona}
                  onChange={e => setPersona(e.target.value)}
                  title="เลือกบุคลิก agent"
                  className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm px-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                >
                  {PERSONAS.map(p => (
                    <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => loadTemplate(false)} disabled={loadingTemplate}>
                  {loadingTemplate ? 'Loading...' : 'Load Template'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => loadTemplate(true)} disabled={loadingTemplate}>
                  Refresh Tools
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 gap-3 min-h-0">
          {linkedBusinessProfile ? (
            <div className={`rounded-md border px-3 py-2 text-xs ${
              businessProfileApplied
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
            }`}>
              <p className="font-medium">
                Business Profile: {linkedBusinessProfile.nameTh}
              </p>
              <p className="mt-0.5">
                {businessProfileApplied
                  ? 'SOUL ปัจจุบันใช้ profile เวอร์ชันล่าสุดแล้ว'
                  : 'Profile ถูกแก้ไขหรือเพิ่งผูกใหม่ ให้กด Load Template แล้ว preview ก่อน Save SOUL'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900">
              ยังไม่ได้ผูก Business Profile กับ agent นี้ · <Link className="underline" href="/business-profiles">ไปที่ Business Profiles</Link>
            </div>
          )}
          {legacyPatterns.length > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">SOUL ยังมี legacy MCP pattern: {legacyPatterns.join(', ')}</p>
                <p className="mt-0.5">ใช้ native MCP ผ่าน openclaw.json และ header mcp-access-mode แทน curl, /call, exec tool, หรือ mcporter</p>
              </div>
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-zinc-400">Loading...</p>
          ) : (
            <Textarea
              value={soul}
              onChange={e => { setSoul(e.target.value); setDirty(true) }}
              className="font-mono text-xs flex-1 resize-none min-h-[400px]"
              placeholder="# Agent Name&#10;คุณคือผู้ช่วย AI ..."
            />
          )}
          <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty} className="shrink-0">
            {save.isPending ? 'Saving...' : 'Save SOUL'}
          </Button>
          {dirty && (
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={resetSessionsAfterSave}
                onChange={e => setResetSessionsAfterSave(e.target.checked)}
              />
              Reset active sessions หลัง Save และ restart gateway
            </label>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pendingTemplate} onOpenChange={open => { if (!open) setPendingTemplate(null) }}>
        <DialogContent className="sm:max-w-3xl max-h-[86vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply SOUL Template?</DialogTitle>
            <DialogDescription>
              Template จะทับข้อความใน textarea เท่านั้น ยังไม่บันทึกลง server จนกด Save SOUL
            </DialogDescription>
          </DialogHeader>
          {pendingTemplate && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="text-zinc-500">Current</p>
                  <p className="mt-1 font-mono">{currentLines} lines</p>
                  <p className="mt-1 break-words text-amber-600">{legacyPatterns.length ? `legacy: ${legacyPatterns.join(', ')}` : 'no legacy pattern'}</p>
                  <p className="mt-1 break-words text-zinc-500">{contractLabel(currentContract)}</p>
                </div>
                <div className="rounded-md border bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="text-zinc-500">Template</p>
                  <p className="mt-1 font-mono">{nextLines} lines</p>
                  <p className="mt-1 break-words text-emerald-600">{pendingLegacyPatterns.length ? `legacy: ${pendingLegacyPatterns.join(', ')}` : 'native MCP template'}</p>
                  <p className="mt-1 break-words text-zinc-500">{contractLabel(pendingContract)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border p-2">
                  <p className="text-zinc-500">Mode</p>
                  <p className="font-mono font-medium">{pendingTemplate.accessMode}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-zinc-500">Tool Source</p>
                  <p className={pendingTemplate.toolSource === 'live' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{pendingTemplate.toolSource}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-zinc-500">Tools</p>
                  <p className="font-mono font-medium">{pendingTemplate.tools.length}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-zinc-500">Persona</p>
                  <p className="font-medium">{pendingTemplate.personaLabel}</p>
                </div>
              </div>
              {pendingTemplate.businessProfile && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  <p className="font-medium">Business Profile included</p>
                  <p className="mt-1">{pendingTemplate.businessProfile.nameTh} · hash {pendingTemplate.businessProfileHash}</p>
                  <p className="mt-1">ส่วนนี้จะถูกใส่ใน SOUL.md หลังบุคลิกและก่อน MCP Tool Contract</p>
                </div>
              )}
              {pendingTemplate.warnings.length > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    {pendingTemplate.warnings.map((w, i) => <p key={i} className="break-words">{w}</p>)}
                  </div>
                </div>
              )}
              {pendingDiff && (
                <div className="rounded-md border bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                  <p className="font-medium">Diff summary</p>
                  <p className="mt-1 text-zinc-500">Line delta: {pendingDiff.lineDelta >= 0 ? '+' : ''}{pendingDiff.lineDelta} · Contract {pendingDiff.contractChanged ? 'changed' : 'unchanged'}</p>
                  {pendingDiff.added.length > 0 && <p className="mt-1 break-words text-emerald-600">Added sections: {pendingDiff.added.join(', ')}</p>}
                  {pendingDiff.removed.length > 0 && <p className="mt-1 break-words text-amber-600">Removed sections: {pendingDiff.removed.join(', ')}</p>}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border p-3">
                  <p className="font-medium text-emerald-600">Allowed capabilities</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pendingTemplate.capabilities.map(c => <Badge key={c.id} variant="secondary" className="max-w-full truncate">{c.label}</Badge>)}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <p className="font-medium text-amber-600">Denied capabilities</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pendingTemplate.deniedCapabilities.map(c => <Badge key={c.id} variant="outline" className="max-w-full truncate">{c.label}</Badge>)}
                  </div>
                </div>
              </div>
              <div className="rounded-md border bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                <p className="font-medium">Allowed tools preview</p>
                <div className="mt-2 max-h-32 overflow-y-auto font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                  {pendingTemplate.tools.map(t => (
                    <p key={t.name} className="truncate">
                      {t.name}{t.required?.length ? ` (${t.required.join(', ')})` : ''}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-zinc-500">ระบบจะ auto-backup SOUL เดิมเมื่อกด Save และ content เปลี่ยนจากเดิม</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTemplate(null)}>Cancel</Button>
            <Button onClick={applyPendingTemplate}>Apply Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Users Panel ───────────────────────────────────────────
function UsersPanel({ agentId }: { agentId: string }) {
  const qc = useQueryClient()
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', agentId],
    queryFn: () => getAgentUsers(agentId),
  })

  const add = useMutation({
    mutationFn: () => addAgentUser(agentId, newId, newName || undefined),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['users', agentId] })
      setNewId(''); setNewName('')
      toast.loading('Restarting gateway...', { id: 'restart' })
      try {
        await restartGateway()
        toast.success('User added — gateway restarted', { id: 'restart' })
      } catch {
        toast.error('User added but gateway restart failed', { id: 'restart' })
      }
    },
    onError: () => toast.error('Failed to add user'),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => deleteAgentUser(agentId, userId),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['users', agentId] })
      toast.loading('Restarting gateway...', { id: 'restart' })
      try {
        await restartGateway()
        toast.success('User removed — gateway restarted', { id: 'restart' })
      } catch {
        toast.error('User removed but gateway restart failed', { id: 'restart' })
      }
    },
    onError: () => toast.error('Failed to remove user'),
  })

  function addUser() {
    const trimmed = newId.trim()
    if (!trimmed || !/^\d+$/.test(trimmed)) { toast.error('User ID ต้องเป็นตัวเลขเท่านั้น เช่น 1234567890'); return }
    if (trimmed.length < 5) { toast.error('Telegram User ID ต้องมีอย่างน้อย 5 หลัก'); return }
    if (users.find(u => u.id === trimmed)) { toast.error('User already added'); return }
    add.mutate()
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Users <Badge variant="secondary" className="ml-1">{users.length}</Badge></CardTitle>
            <p className="text-xs text-zinc-500 mt-0.5">Telegram user ที่สามารถคุยกับ agent นี้ได้ — หา ID จาก @userinfobot</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Telegram User ID"
            value={newId}
            onChange={e => setNewId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addUser()}
            type="number"
            className="w-40"
          />
          <Input
            placeholder="ชื่อ (optional)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addUser()}
          />
          <Button onClick={addUser} disabled={add.isPending || !newId}>
            {add.isPending ? '...' : 'Add'}
          </Button>
        </div>

        {isLoading && <p className="text-sm text-zinc-400">Loading...</p>}
        {!isLoading && users.length === 0 && (
          <p className="text-sm text-zinc-400 py-2 text-center border rounded-md">ยังไม่มี user — เพิ่ม Telegram ID ด้านบน</p>
        )}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between border rounded-md px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium shrink-0">
                  {u.name ? u.name[0].toUpperCase() : '#'}
                </div>
                <div>
                  {u.name && <p className="text-sm font-medium leading-none">{u.name}</p>}
                  <p className="font-mono text-xs text-zinc-500">{u.id}</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                onClick={() => remove.mutate(u.id)} disabled={remove.isPending}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── MCP Panel ─────────────────────────────────────────────
function McpPanel({ agentId }: { agentId: string }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState(DEFAULT_MCP_URL)
  const [accessMode, setAccessMode] = useState(defaultAccessMode(agentId))
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [mcpTesting, setMcpTesting] = useState(false)
  const [mcpTools, setMcpTools] = useState<McpTool[] | null>(null)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [showTools, setShowTools] = useState(false)

  const { data: mcp } = useQuery({
    queryKey: ['mcp', agentId],
    queryFn: () => getAgentMcp(agentId),
  })

  useEffect(() => {
    if (mcp) {
      const server = Object.values(mcp.mcpServers ?? {})[0]
      if (server) {
        setUrl(server.url || DEFAULT_MCP_URL)
        // รองรับทั้ง headers (ใหม่) และ env (เก่า) เพื่อ backward compat
        setAccessMode(server.headers?.['mcp-access-mode'] ?? server.env?.MCP_ACCESS_MODE ?? defaultAccessMode(agentId))
      } else {
        setUrl(DEFAULT_MCP_URL)
        setAccessMode(defaultAccessMode(agentId))
      }
    }
  }, [agentId, mcp])

  const save = useMutation({
    mutationFn: async () => {
      const serverName = Object.keys(mcp?.mcpServers ?? {})[0] ?? agentId
      const newMcp: McpConfig = {
        mcpServers: {
          [serverName]: {
            type: 'http',
            url,
            allowHttp: url.startsWith('http://'),
            headers: { 'mcp-access-mode': accessMode },
            // ไม่ส่ง env เพื่อลบ MCP_ACCESS_MODE เก่าที่อาจ conflict กับ headers
          },
        },
      }
      await putAgentMcp(agentId, newMcp)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mcp', agentId] }); toast.success('MCP saved') },
    onError: () => toast.error('Failed to save MCP'),
  })

  async function testConnection() {
    setTesting(true); setTestResult('idle')
    try {
      await testAgentMcp(agentId, accessMode)
      setTestResult('ok')
    } catch { setTestResult('fail') }
    finally { setTesting(false) }
  }

  async function testMcpAccess() {
    setMcpTesting(true); setMcpTools(null); setMcpError(null); setShowTools(true)
    try {
      const result = await testAgentMcp(agentId, accessMode)
      if (result.tools?.length > 0) setMcpTools(result.tools)
      else if (result.raw) setMcpError(`ไม่พบ tools — raw output:\n${result.raw}`)
      else setMcpTools([])
    } catch (e: unknown) {
      setMcpError(e instanceof Error ? e.message : String(e))
    } finally { setMcpTesting(false) }
  }

  const currentMode = ACCESS_MODES.find(m => m.value === accessMode)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">MCP</CardTitle>
        <p className="text-xs text-zinc-500 mt-0.5">Model Context Protocol — ให้ agent เรียก tool ดึงข้อมูล ERP จริง</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* URL */}
        <div className="space-y-1.5">
          <Label className="text-xs">MCP Server URL</Label>
          <div className="flex gap-2">
            <Input value={url} onChange={e => { setUrl(e.target.value); setTestResult('idle') }}
              placeholder={DEFAULT_MCP_URL} className="text-sm font-mono" />
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !url} className="shrink-0">
              {testing ? '...' : 'Ping'}
            </Button>
            {testResult !== 'idle' && (
              <Badge variant={testResult === 'ok' ? 'default' : 'destructive'} className="shrink-0">
                {testResult === 'ok' ? '● Online' : '● Offline'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-400">Ping เช็คเฉพาะว่า server online ไหม — ไม่ทดสอบสิทธิ์</p>
        </div>

        {/* Access Mode */}
        <div className="space-y-1.5">
          <Label className="text-xs">Access Mode</Label>
          <Select value={accessMode} onValueChange={v => v && setAccessMode(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_MODES.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="font-mono font-medium">{m.label}</span>
                  <span className="text-zinc-400 ml-2 text-xs">— {m.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-zinc-400">
            ส่งสิทธิ์เป็น header <span className="font-mono text-zinc-600 dark:text-zinc-300">mcp-access-mode: {accessMode}</span>
            {currentMode ? <span> — {currentMode.desc}</span> : null}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? 'Saving...' : 'Save MCP'}
          </Button>
          <Button variant="outline" size="sm" onClick={testMcpAccess} disabled={mcpTesting || !url}>
            {mcpTesting ? 'Loading tools...' : `Test Access (${accessMode})`}
          </Button>
        </div>

        {/* Tools result */}
        {(mcpTools !== null || mcpError) && (
          <div className="border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTools(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <span>
                {mcpError ? '⚠ Error' : `✓ ${mcpTools?.length} tools พบใน mode "${accessMode}"`}
              </span>
              <span className="text-zinc-400 text-xs">{showTools ? '▲ ซ่อน' : '▼ ดู'}</span>
            </button>
            {showTools && (
              <div className="max-h-56 overflow-y-auto divide-y">
                {mcpError ? (
                  <pre className="px-3 py-2 text-xs text-red-500 whitespace-pre-wrap">{mcpError}</pre>
                ) : mcpTools?.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-amber-600">ไม่พบ tools — ลอง save MCP config ก่อนแล้ว test ใหม่</p>
                ) : (
                  mcpTools?.map(t => (
                    <div key={t.name} className="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <p className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200">{t.name}</p>
                      {t.description && <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{t.description}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← Agents</Link>
        <h1 className="text-2xl font-bold">Agent: <span className="text-zinc-600 dark:text-zinc-300">{id}</span></h1>
        <Link href={`/agents/${id}/chat`}>
          <Button variant="outline" size="sm">Chat Monitor</Button>
        </Link>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ซ้าย: SOUL */}
        <SoulPanel agentId={id} />

        {/* ขวา: Users + MCP */}
        <div className="space-y-4">
          <UsersPanel agentId={id} />
          <McpPanel agentId={id} />
        </div>
      </div>
    </div>
  )
}
