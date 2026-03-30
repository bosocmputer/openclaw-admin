'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAgentSoul, putAgentSoul,
  getAgentMcp, putAgentMcp,
  getAgentUsers, addAgentUser, deleteAgentUser,
  restartGateway, testAgentMcp, api,
  type McpConfig, type McpTool,
} from '@/lib/api'
import { useState, useEffect, use } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import Link from 'next/link'

// ── Soul Panel ────────────────────────────────────────────
function SoulPanel({ agentId }: { agentId: string }) {
  const qc = useQueryClient()
  const [soul, setSoul] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['soul', agentId],
    queryFn: () => getAgentSoul(agentId),
  })

  useEffect(() => { if (data !== undefined) { setSoul(data); setDirty(false) } }, [data])

  const save = useMutation({
    mutationFn: () => putAgentSoul(agentId, soul),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['soul', agentId] })
      setDirty(false)
      toast.success('SOUL saved')
    },
    onError: () => toast.error('Failed to save SOUL'),
  })

  async function loadTemplate() {
    setLoadingTemplate(true)
    try {
      const { data } = await api.get(`/api/agents/${agentId}/soul/template`)
      setSoul(data.soul)
      setDirty(true)
      toast.success(`โหลด template สำหรับ mode "${data.accessMode}" แล้ว — กด Save เพื่อบันทึก`)
    } catch {
      toast.error('Failed to load template')
    } finally {
      setLoadingTemplate(false)
    }
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">SOUL</CardTitle>
            <p className="text-xs text-zinc-500 mt-0.5">System prompt ที่กำหนดบุคลิก ขอบเขต และพฤติกรรมของ agent</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Badge variant="outline" className="text-amber-600 border-amber-400">Unsaved</Badge>}
            <Button variant="outline" size="sm" onClick={loadTemplate} disabled={loadingTemplate}>
              {loadingTemplate ? 'Loading...' : 'Load Template'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3 min-h-0">
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
      </CardContent>
    </Card>
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
  const [url, setUrl] = useState('')
  const [accessMode, setAccessMode] = useState('general')
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
        setUrl(server.url ?? '')
        // รองรับทั้ง headers (ใหม่) และ env (เก่า) เพื่อ backward compat
        setAccessMode(server.headers?.['mcp-access-mode'] ?? server.env?.MCP_ACCESS_MODE ?? 'general')
      }
    }
  }, [mcp])

  const save = useMutation({
    mutationFn: async () => {
      const serverName = Object.keys(mcp?.mcpServers ?? {})[0] ?? 'mcp'
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

  const ACCESS_MODES = [
    { value: 'admin',    label: 'admin',    desc: 'เห็นทุกอย่าง รวมถึงรายงานและวิเคราะห์' },
    { value: 'sales',    label: 'sales',    desc: 'แผนกขาย' },
    { value: 'purchase', label: 'purchase', desc: 'แผนกจัดซื้อ' },
    { value: 'stock',    label: 'stock',    desc: 'แผนกคลังสินค้า' },
    { value: 'general',  label: 'general',  desc: 'ทั่วไป (ค่าเริ่มต้น)' },
  ]
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
              placeholder="http://host:port/sse" className="text-sm font-mono" />
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
          {currentMode && (
            <p className="text-xs text-zinc-400 font-mono">MCP_ACCESS_MODE=<span className="text-zinc-600 dark:text-zinc-300 font-medium">{accessMode}</span></p>
          )}
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
