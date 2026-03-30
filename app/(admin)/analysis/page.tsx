'use client'

import { useQuery, useQueries } from '@tanstack/react-query'
import {
  getAgents, getMembers, getWebchatRooms, getGatewayLogs, getAgentSessions,
  getLineConfig, getLineBotInfo, getMonitorCost, getAlerting, putAlerting,
  type Agent, type Member, type WebchatRoom, type LogEntry, type ChatSession, type LineBotInfo,
  type CostData, type AlertingConfig,
} from '@/lib/api'
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtTime(ts: number | string): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function AgentCard({ agent, sessions }: { agent: Agent, sessions: ChatSession[] }) {
  const totalInput = sessions.reduce((s, x) => s + (x.inputTokens ?? 0), 0)
  const totalOutput = sessions.reduce((s, x) => s + (x.outputTokens ?? 0), 0)

  const userCounts: Record<string, number> = {}
  sessions.forEach(s => {
    userCounts[s.userLabel] = (userCounts[s.userLabel] ?? 0) + 1
  })
  const top5 = Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold font-mono">{agent.id}</CardTitle>
        <div className="flex gap-4 text-xs text-zinc-500 mt-1">
          <span>{sessions.length} sessions</span>
          <span>in: {fmtTokens(totalInput)} / out: {fmtTokens(totalOutput)}</span>
          <span>{Object.keys(userCounts).length} users</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {top5.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1">Top Users</p>
            <div className="flex flex-wrap gap-2">
              {top5.map(([label, count]) => (
                <span key={label} className="text-xs bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-0.5">
                  {label} <span className="text-zinc-400">({count})</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {sorted.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1">Sessions</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {sorted.map(s => (
                <div key={s.sessionId} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-zinc-400 truncate w-24 shrink-0">{s.sessionId.slice(0, 10)}…</span>
                  <span className="truncate flex-1">{s.userLabel}</span>
                  <span className="text-zinc-400 shrink-0">{fmtTime(s.updatedAt)}</span>
                  <span className="text-zinc-400 shrink-0">{fmtTokens((s.inputTokens ?? 0) + (s.outputTokens ?? 0))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {sessions.length === 0 && (
          <p className="text-xs text-zinc-400">ยังไม่มี sessions</p>
        )}
      </CardContent>
    </Card>
  )
}

function OverviewSection({ agents, members, webchatRooms, lineAccountCount }: { agents: Agent[], members: Member[], webchatRooms: WebchatRoom[], lineAccountCount: number }) {
  const totalTelegramUsers = agents.reduce((s, a) => s + (a.users?.length ?? 0), 0)
  const stats = [
    { label: 'Total Agents', value: agents.length },
    { label: 'Telegram Users', value: totalTelegramUsers },
    { label: 'Members', value: members.length },
    { label: 'Webchat Rooms', value: webchatRooms.length },
    { label: 'LINE OA', value: lineAccountCount },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {stats.map(s => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">{s.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AgentsSection({ agents, sessionsByAgent }: { agents: Agent[], sessionsByAgent: Record<string, ChatSession[]> }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agents &amp; Telegram</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} sessions={sessionsByAgent[agent.id] ?? []} />
        ))}
      </div>
    </div>
  )
}

function WebchatSection({ rooms }: { rooms: WebchatRoom[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Webchat</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {rooms.map(room => (
          <Card key={room.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{room.display_name}</CardTitle>
                <Badge variant={room.policy === 'open' ? 'default' : 'secondary'} className="text-xs">{room.policy}</Badge>
              </div>
              <p className="text-xs text-zinc-400">Agent: {room.agent_id}</p>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500 space-y-1">
              {room.policy === 'allowlist' && (
                <p>{room.allowed_users?.length ?? 0} allowed users</p>
              )}
              <p>Created: {new Date(room.created_at).toLocaleDateString('th-TH')}</p>
            </CardContent>
          </Card>
        ))}
        {rooms.length === 0 && (
          <p className="text-sm text-zinc-400 col-span-3">ยังไม่มีห้อง</p>
        )}
      </div>
    </div>
  )
}

function MembersSection({ members }: { members: Member[] }) {
  const groups: Array<'superadmin' | 'admin' | 'chat'> = ['superadmin', 'admin', 'chat']
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Members</h2>
      {groups.map(role => {
        const group = members.filter(m => m.role === role)
        if (group.length === 0) return null
        return (
          <div key={role}>
            <p className="text-sm font-medium text-zinc-500 mb-2 capitalize">{role} ({group.length})</p>
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {group.map(m => (
                    <div key={m.id} className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-medium w-32 shrink-0 truncate">{m.username}</span>
                      <span className="text-zinc-500 flex-1 truncate">{m.display_name}</span>
                      <Badge variant={m.role === 'superadmin' ? 'destructive' : m.role === 'admin' ? 'default' : 'secondary'} className="text-xs shrink-0">
                        {m.role}
                      </Badge>
                      <Badge variant={m.is_active ? 'default' : 'secondary'} className={`text-xs shrink-0 ${m.is_active ? 'bg-green-600' : ''}`}>
                        {m.is_active ? 'active' : 'inactive'}
                      </Badge>
                      <span className="text-xs text-zinc-400 shrink-0">{new Date(m.created_at).toLocaleDateString('th-TH')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}

function SystemSection({ logs }: { logs: LogEntry[] }) {
  const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 }
  logs.forEach(l => {
    const lvl = l.level?.toUpperCase()
    if (lvl in counts) counts[lvl as keyof typeof counts]++
  })

  const critical = logs.filter(l => {
    const lvl = l.level?.toUpperCase()
    return lvl === 'ERROR' || lvl === 'WARN'
  }).slice(-50).reverse()

  const fmtLogTime = (t: string) => {
    try {
      return new Date(t).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return t
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">System Logs</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500">Errors</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{counts.ERROR}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500">Warnings</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-500">{counts.WARN}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500">Info</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-500">{counts.INFO}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500">Debug</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-zinc-400">{counts.DEBUG}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-500">Errors &amp; Warnings (last 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {critical.length === 0 ? (
            <p className="text-sm text-green-600 font-medium">ไม่มี errors หรือ warnings</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {critical.map((l, i) => {
                const lvl = l.level?.toUpperCase()
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-zinc-400 shrink-0 w-28">{fmtLogTime(l.time)}</span>
                    <Badge
                      variant={lvl === 'ERROR' ? 'destructive' : 'secondary'}
                      className={`text-xs shrink-0 ${lvl === 'WARN' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : ''}`}
                    >
                      {l.level}
                    </Badge>
                    <span className="text-zinc-400 shrink-0 w-20 truncate font-mono">{l.subsystem}</span>
                    <span className="text-zinc-700 dark:text-zinc-300 break-all">{l.msg?.slice(0, 120)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CostDashboard({ data }: { data: CostData }) {
  const agentIds = useMemo(() => {
    const ids = new Set<string>()
    data.days.forEach(d => d.agents.forEach(a => ids.add(a.agentId)))
    return Array.from(ids).sort()
  }, [data])

  const fmtCost = (n: number) => n === 0 ? '$0' : n < 0.001 ? '<$0.001' : `$${n.toFixed(3)}`

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Cost Dashboard</h2>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500">Total (30 days)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-500">{fmtCost(data.summary.totalCost)}</p></CardContent>
        </Card>
        {agentIds.map(id => (
          <Card key={id}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500 font-mono">{id}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{fmtCost(data.summary.byAgent[id] ?? 0)}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Daily table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-500">Daily Cost (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-1 pr-4 text-zinc-500 font-medium">Date</th>
                  {agentIds.map(id => (
                    <th key={id} className="text-right py-1 px-2 text-zinc-500 font-medium font-mono">{id}</th>
                  ))}
                  <th className="text-right py-1 pl-2 text-zinc-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...data.days].reverse().map(day => {
                  const totalDay = day.total
                  const isHigh = totalDay > 1
                  const isMid = totalDay > 0.1
                  return (
                    <tr key={day.date} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <td className="py-1 pr-4 font-mono text-zinc-500">{day.date}</td>
                      {agentIds.map(id => {
                        const a = day.agents.find(x => x.agentId === id)
                        return <td key={id} className="text-right px-2 tabular-nums">{a ? fmtCost(a.cost) : '—'}</td>
                      })}
                      <td className={`text-right pl-2 font-semibold tabular-nums ${isHigh ? 'text-red-500' : isMid ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {fmtCost(totalDay)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AlertingSection({ initialConfig }: { initialConfig: AlertingConfig }) {
  const [config, setConfig] = useState<AlertingConfig>(initialConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await putAlerting(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Error Alerting</h2>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="alert-enabled"
              checked={config.telegram.enabled}
              onChange={e => setConfig(c => ({ ...c, telegram: { ...c.telegram, enabled: e.target.checked } }))}
              className="w-4 h-4 accent-emerald-500"
            />
            <label htmlFor="alert-enabled" className="text-sm font-medium">เปิดใช้งาน Telegram Alert</label>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-500 w-32 shrink-0">Chat ID</label>
            <input
              type="text"
              value={config.telegram.chatId}
              onChange={e => setConfig(c => ({ ...c, telegram: { ...c.telegram, chatId: e.target.value } }))}
              placeholder="ใส่ Telegram chat_id หรือ group_id"
              className="flex-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded px-3 py-1.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <p className="text-xs text-zinc-400">Bot token ใช้จาก Telegram channel ที่ตั้งค่าไว้แล้ว • แจ้งเตือนเมื่อ agent error หรือหยุดกลางคัน</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
            {saved && <span className="text-xs text-emerald-500">✓ บันทึกแล้ว</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LineSection({ accounts }: { accounts: { accountId: string; botInfo: LineBotInfo | null }[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">LINE OA</h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-400">ยังไม่มี LINE OA</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {accounts.map(({ accountId, botInfo }) => (
            <Card key={accountId}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">{botInfo?.displayName ?? accountId}</CardTitle>
                  <Badge variant="outline" className="text-xs font-mono">{accountId}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500 space-y-1">
                {botInfo?.basicId && <p>@{botInfo.basicId}</p>}
                <p className="text-zinc-400">dmPolicy: open</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AnalysisPage() {
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers })
  const { data: costData } = useQuery({ queryKey: ['monitor-cost'], queryFn: () => getMonitorCost(30) })
  const { data: alertingConfig } = useQuery({ queryKey: ['alerting-config'], queryFn: getAlerting })
  const { data: webchatRooms = [] } = useQuery({ queryKey: ['webchat-rooms-dash'], queryFn: () => getWebchatRooms() })
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['gateway-logs'],
    queryFn: () => getGatewayLogs(1000),
  })

  const { data: lineConfig } = useQuery({ queryKey: ['line-config'], queryFn: getLineConfig })
  const { data: lineBotInfo } = useQuery({
    queryKey: ['line-botinfo'],
    queryFn: getLineBotInfo,
    enabled: !!lineConfig?.line,
    retry: false,
  })

  // โหลด sessions ทุก agent พร้อมกันใน parent — ไม่ให้แต่ละ AgentCard เรียก API เอง
  const sessionResults = useQueries({
    queries: agents.map(a => ({
      queryKey: ['sessions', a.id],
      queryFn: () => getAgentSessions(a.id),
      enabled: agents.length > 0,
    })),
  })

  const sessionsByAgent = useMemo(() => {
    const map: Record<string, ChatSession[]> = {}
    agents.forEach((a, i) => {
      map[a.id] = (sessionResults[i]?.data as ChatSession[] | undefined) ?? []
    })
    return map
  }, [agents, sessionResults])

  const lineAccounts = useMemo(() => {
    const lineConfigLine = lineConfig?.line as any
    const namedAccounts = Object.keys(lineConfigLine?.accounts ?? {})
    const topLevelToken = lineConfigLine?.channelAccessToken
    const accountIds = namedAccounts.length > 0 ? namedAccounts : (topLevelToken ? ['default'] : [])
    return accountIds.map(accountId => ({
      accountId,
      botInfo: lineBotInfo?.[accountId] ?? null,
    }))
  }, [lineConfig, lineBotInfo])

  return (
    <div className="space-y-8 w-full">
      <div>
        <h1 className="text-2xl font-bold">Analysis</h1>
        <p className="text-sm text-zinc-500 mt-1">ภาพรวมระบบทั้งหมด</p>
      </div>

      <OverviewSection agents={agents} members={members} webchatRooms={webchatRooms} lineAccountCount={lineAccounts.length} />

      <AgentsSection agents={agents} sessionsByAgent={sessionsByAgent} />

      <LineSection accounts={lineAccounts} />

      <WebchatSection rooms={webchatRooms} />

      <MembersSection members={members} />

      {costData && <CostDashboard data={costData} />}

      {alertingConfig && <AlertingSection initialConfig={alertingConfig} />}

      {logsLoading ? (
        <p className="text-sm text-zinc-400">Loading logs...</p>
      ) : (
        <SystemSection logs={logs} />
      )}
    </div>
  )
}
