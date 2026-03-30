'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAgents, getAgentMcp, putAgentMcp, testAgentMcp, type McpConfig } from '@/lib/api'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

function McpAgentForm({ agentId }: { agentId: string }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [accessMode, setAccessMode] = useState('open')
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [testTools, setTestTools] = useState<string[]>([])
  const [testing, setTesting] = useState(false)

  const { data: mcp } = useQuery({
    queryKey: ['mcp', agentId],
    queryFn: () => getAgentMcp(agentId),
  })

  useEffect(() => {
    if (mcp) {
      const server = Object.values(mcp.mcpServers ?? {})[0]
      if (server) {
        setUrl(server.url ?? '')
        // รองรับทั้ง headers (ใหม่) และ env (เก่า)
        setAccessMode(
          server.headers?.['mcp-access-mode'] ??
          server.env?.MCP_ACCESS_MODE ??
          'open'
        )
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
          },
        },
      }
      await putAgentMcp(agentId, newMcp)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp', agentId] })
      toast.success(`MCP saved for agent: ${agentId}`)
    },
    onError: () => toast.error('Failed to save MCP config'),
  })

  async function testConnection() {
    if (!url) return
    setTesting(true)
    setTestResult('idle')
    setTestTools([])

    // บันทึก config ก่อนทดสอบ (server-side test ต้องการ mcporter.json)
    try {
      const serverName = Object.keys(mcp?.mcpServers ?? {})[0] ?? 'mcp'
      await putAgentMcp(agentId, {
        mcpServers: {
          [serverName]: {
            type: 'http',
            url,
            allowHttp: url.startsWith('http://'),
            headers: { 'mcp-access-mode': accessMode },
          },
        },
      })
      qc.invalidateQueries({ queryKey: ['mcp', agentId] })
    } catch {
      // ถ้า save ไม่ได้ก็ลองทดสอบด้วย config ปัจจุบันก่อน
    }

    try {
      const result = await testAgentMcp(agentId, accessMode)
      setTestResult('ok')
      setTestTools(result.tools?.map(t => t.name) ?? [])
      toast.success(`MCP OK — ${result.tools?.length ?? 0} tools (mode: ${result.accessMode})`)
    } catch (e: unknown) {
      setTestResult('fail')
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Connection failed'
      toast.error(`MCP Error: ${msg}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent: {agentId}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>MCP Server URL</Label>
          <div className="flex gap-2">
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://host:port/sse" />
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !url}>
              {testing ? 'Testing...' : 'Test'}
            </Button>
            {testResult !== 'idle' && (
              <Badge variant={testResult === 'ok' ? 'default' : 'destructive'}>
                {testResult === 'ok' ? 'OK' : 'Fail'}
              </Badge>
            )}
          </div>
          {testResult === 'ok' && testTools.length > 0 && (
            <p className="text-xs text-zinc-500 mt-1">Tools: {testTools.join(', ')}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>MCP_ACCESS_MODE</Label>
          <Select value={accessMode} onValueChange={v => v && setAccessMode(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">open</SelectItem>
              <SelectItem value="strict">strict</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function McpPage() {
  const { data: agents, isLoading } = useQuery({ queryKey: ['agents'], queryFn: getAgents })

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">MCP Config</h1>
        <p className="text-sm text-zinc-500 mt-1">ตั้งค่า MCP server (ระบบ tool ภายนอก) สำหรับแต่ละ agent — กด Test เพื่อตรวจสอบการเชื่อมต่อก่อน Save</p>
      </div>

      {isLoading && <p className="text-sm text-zinc-400">Loading...</p>}
      {agents?.map(a => <McpAgentForm key={a.id} agentId={a.id} />)}
    </div>
  )
}
