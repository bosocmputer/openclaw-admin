'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getAgents, getMembers, getWebchatRooms, getChatUsers, getGatewayLogs, getAgentSessions,
  type Agent, type Member, type WebchatRoom, type ChatUser, type LogEntry, type ChatSession,
} from '@/lib/api'
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

function AgentCard({ agent }: { agent: Agent }) {
  const { data: sessions = [] } = useQuery<ChatSession[]>({
    queryKey: ['sessions', agent.id],
    queryFn: () => getAgentSessions(agent.id),
  })

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

function OverviewSection({ agents, members, webchatRooms }: { agents: Agent[], members: Member[], webchatRooms: WebchatRoom[] }) {
  const totalTelegramUsers = agents.reduce((s, a) => s + (a.users?.length ?? 0), 0)
  const stats = [
    { label: 'Total Agents', value: agents.length },
    { label: 'Telegram Users', value: totalTelegramUsers },
    { label: 'Members', value: members.length },
    { label: 'Webchat Rooms', value: webchatRooms.length },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

function AgentsSection({ agents }: { agents: Agent[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agents &amp; Telegram</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
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

export default function AnalysisPage() {
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents })
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers })
  const { data: webchatRooms = [] } = useQuery({ queryKey: ['webchat-rooms-dash'], queryFn: getWebchatRooms })
  const { data: chatUsers = [] } = useQuery({ queryKey: ['chat-users-dash'], queryFn: getChatUsers })
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['gateway-logs'],
    queryFn: () => getGatewayLogs(1000),
  })

  return (
    <div className="space-y-8 w-full">
      <div>
        <h1 className="text-2xl font-bold">Analysis</h1>
        <p className="text-sm text-zinc-500 mt-1">ภาพรวมระบบทั้งหมด</p>
      </div>

      <OverviewSection agents={agents} members={members} webchatRooms={webchatRooms} />

      <AgentsSection agents={agents} />

      <WebchatSection rooms={webchatRooms} />

      <MembersSection members={members} />

      {logsLoading ? (
        <p className="text-sm text-zinc-400">Loading logs...</p>
      ) : (
        <SystemSection logs={logs} />
      )}
    </div>
  )
}
