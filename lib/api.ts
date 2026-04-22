import axios, { type AxiosError } from 'axios'

// All requests go through /api/proxy — token never leaves the server
export const api = axios.create({
  baseURL: '/api/proxy',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// 401 → redirect to login
api.interceptors.response.use(
  res => res,
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Types
export interface GatewayStatus {
  gateway: 'online' | 'offline'
}

export interface McpServer {
  type: string
  url: string
  allowHttp?: boolean
  headers?: Record<string, string>
  env?: Record<string, string>  // legacy — ใช้ headers แทน
}

export interface McpConfig {
  mcpServers: Record<string, McpServer>
}

export interface AgentUser {
  id: string
  name?: string
}

export interface Agent {
  id: string
  workspace: string
  soul?: string
  mcp?: McpConfig
  users?: AgentUser[]
}

export interface OpenClawConfig {
  env?: {
    OPENROUTER_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    MISTRAL_API_KEY?: string
    GROQ_API_KEY?: string
    MCP_ACCESS_MODE?: string
    [key: string]: string | undefined
  }
  agents?: {
    defaults?: {
      model?: {
        primary?: string
      }
      compaction?: {
        mode?: 'default' | 'safeguard'
        maxHistoryShare?: number
        keepRecentTokens?: number
        recentTurnsPreserve?: number
        memoryFlush?: {
          softThresholdTokens?: number
        }
        [key: string]: unknown
      }
    }
    list?: { id: string; workspace: string }[]
  }
  bindings?: {
    agentId: string
    match: {
      channel: string
      peer: { kind: string; id: string }
    }
  }[]
  channels?: {
    telegram?: {
      enabled?: boolean
      dmPolicy?: string
      botToken?: string
      allowFrom?: (number | string)[]
      groupPolicy?: string
      streaming?: string
      accounts?: Record<string, {
        enabled?: boolean
        dmPolicy?: string
        botToken?: string
        allowFrom?: (number | string)[]
        groupPolicy?: string
        streaming?: string
      }>
    }
  }
  gateway?: {
    mode?: string
    webchat?: { chatHistoryMaxChars?: number }
  }
}

export interface ProviderConfig {
  id: string
  label: string
  envKey: string
  modelPrefix: string
  noApiKey?: boolean  // provider ที่ไม่ต้องการ API key (เช่น Kilo AI)
}

export const PROVIDERS: ProviderConfig[] = [
  { id: 'openrouter', label: 'OpenRouter',    envKey: 'OPENROUTER_API_KEY', modelPrefix: 'openrouter' },
  { id: 'anthropic',  label: 'Anthropic',     envKey: 'ANTHROPIC_API_KEY',  modelPrefix: 'anthropic'  },
  { id: 'google',     label: 'Google Gemini', envKey: 'GEMINI_API_KEY',     modelPrefix: 'google'     },
  { id: 'openai',     label: 'OpenAI',        envKey: 'OPENAI_API_KEY',     modelPrefix: 'openai'     },
  { id: 'mistral',    label: 'Mistral',       envKey: 'MISTRAL_API_KEY',    modelPrefix: 'mistral'    },
  { id: 'groq',       label: 'Groq',          envKey: 'GROQ_API_KEY',       modelPrefix: 'groq'       },
  { id: 'kilocode',   label: 'Kilo AI',       envKey: 'KILOCODE_API_KEY',   modelPrefix: 'kilocode' },
]

export async function testProvider(provider: string, apiKey: string, signal?: AbortSignal): Promise<boolean> {
  const { data } = await api.post('/api/models/test', { provider, apiKey }, { signal })
  return !!data.ok
}

export interface OpenRouterModel {
  id: string
  name: string
  pricing?: {
    prompt: string
    completion: string
  }
}

// API functions
export async function getStatus(): Promise<GatewayStatus> {
  const { data } = await api.get('/api/status')
  return data
}

export async function getConfig(): Promise<OpenClawConfig> {
  const { data } = await api.get('/api/config')
  return data
}

export async function putConfig(config: OpenClawConfig): Promise<void> {
  await api.put('/api/config', config)
}

export async function getAgents(): Promise<Agent[]> {
  const { data } = await api.get('/api/agents')
  return data
}

export async function getAgentSoul(id: string): Promise<string> {
  const { data } = await api.get(`/api/agents/${id}/soul`)
  return data.soul ?? data
}

export async function putAgentSoul(id: string, soul: string): Promise<void> {
  await api.put(`/api/agents/${id}/soul`, { soul })
}

export async function getAgentMcp(id: string): Promise<McpConfig> {
  const { data } = await api.get(`/api/agents/${id}/mcp`)
  return data
}

export async function putAgentMcp(id: string, mcp: McpConfig): Promise<void> {
  await api.put(`/api/agents/${id}/mcp`, mcp)
}

export async function getUserNames(): Promise<Record<string, string>> {
  const { data } = await api.get('/api/usernames')
  return data
}

export async function getAgentUsers(agentId: string): Promise<AgentUser[]> {
  const { data } = await api.get(`/api/agents/${agentId}/users`)
  return data
}

export async function addAgentUser(agentId: string, userId: string, name?: string): Promise<void> {
  await api.post(`/api/agents/${agentId}/users`, { userId, name })
}

export async function deleteAgentUser(agentId: string, userId: string): Promise<void> {
  await api.delete(`/api/agents/${agentId}/users/${userId}`)
}

export async function restartGateway(): Promise<void> {
  await api.post('/api/gateway/restart')
}

export async function cleanSessions(): Promise<void> {
  await api.post('/api/gateway/clean-sessions')
}

export async function getTelegramBotInfo(): Promise<Record<string, string>> {
  const { data } = await api.get('/api/telegram/botinfo')
  return data
}

export async function getTelegramBindings(): Promise<{ accountId: string; agentId: string }[]> {
  const { data } = await api.get('/api/telegram/bindings')
  return data
}

export async function setTelegramBinding(accountId: string, agentId: string): Promise<void> {
  await api.put('/api/telegram/bindings', { accountId, agentId })
}

export async function setTelegramDefault(accountId: string, oldAccountId: string): Promise<void> {
  await api.post('/api/telegram/set-default', { accountId, oldAccountId })
}

export async function addTelegramAccount(accountId: string, token: string): Promise<void> {
  await api.post('/api/telegram/accounts', { accountId, token })
}

export async function deleteTelegramAccount(accountId: string): Promise<void> {
  await api.delete(`/api/telegram/accounts/${accountId}`)
}

export async function approvePairing(code: string): Promise<void> {
  await api.post('/api/telegram/approve', { code })
}

export interface LineBotInfo {
  displayName: string | null
  pictureUrl: string | null
  basicId: string | null
}

export interface LinePendingItem {
  code: string
  senderId: string
  createdAt: number
  expiresAt: number
}

export async function getLineConfig(): Promise<{ line: Record<string, unknown> | null }> {
  const { data } = await api.get('/api/line')
  return data
}

export async function getLineBotInfo(): Promise<Record<string, LineBotInfo>> {
  const { data } = await api.get('/api/line/botinfo')
  return data
}

export async function getLineBindings(): Promise<{ accountId: string; agentId: string }[]> {
  const { data } = await api.get('/api/line/bindings')
  return data
}

export async function setLineBinding(accountId: string, agentId: string): Promise<void> {
  await api.put('/api/line/bindings', { accountId, agentId })
}

export async function addLineAccount(accountId: string, channelAccessToken: string, channelSecret: string, webhookPath?: string): Promise<void> {
  await api.post('/api/line/accounts', { accountId, channelAccessToken, channelSecret, webhookPath })
}

export async function deleteLineAccount(accountId: string): Promise<void> {
  await api.delete(`/api/line/accounts/${accountId}`)
}

export async function updateLineAccount(accountId: string, fields: { channelAccessToken?: string; channelSecret?: string; webhookPath?: string }): Promise<void> {
  await api.patch(`/api/line/accounts/${accountId}`, fields)
}

export async function getLinePending(): Promise<LinePendingItem[]> {
  const { data } = await api.get('/api/line/pending')
  return data
}

export async function approveLinePairing(code: string): Promise<void> {
  await api.post('/api/line/approve', { code })
}

export async function getDoctorStatus(): Promise<{ valid: boolean; problems: string[] }> {
  const { data } = await api.get('/api/doctor/status')
  return data
}

export async function runDoctorFix(): Promise<void> {
  await api.post('/api/doctor/fix')
}

export interface McpTool {
  name: string
  description: string
}

export async function testAgentMcp(agentId: string, accessMode: string): Promise<{ ok: boolean; serverName: string; accessMode: string; tools: McpTool[]; raw?: string; error?: string }> {
  const { data } = await api.post(`/api/agents/${agentId}/mcp/test`, { accessMode })
  return data
}

export async function getModels(provider: string): Promise<OpenRouterModel[]> {
  const { data } = await api.get('/api/models', { params: { provider } })
  return Array.isArray(data) ? data : (data.data ?? [])
}

export interface ChatSession {
  sessionId: string
  userLabel: string
  userFrom: string
  updatedAt: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ChatMessage {
  id: string
  timestamp: string
  role: 'user' | 'assistant'
  text: string
  senderId?: string | null
  senderName?: string | null
}

export async function getAgentSessions(agentId: string): Promise<ChatSession[]> {
  const { data } = await api.get(`/api/agents/${agentId}/sessions`)
  return data
}

export async function getSessionMessages(agentId: string, sessionId: string): Promise<ChatMessage[]> {
  const { data } = await api.get(`/api/agents/${agentId}/sessions/${sessionId}`)
  return data
}

// ─── Webchat ──────────────────────────────────────────────────────────────────

export interface WebchatRoom {
  id: number
  agent_id: string
  display_name: string
  policy: 'open' | 'allowlist'
  created_at: string
  allowed_users: string[]
}

export interface WebchatMessage {
  id: number
  username: string
  role: 'user' | 'assistant'
  content: string
  run_id?: string
  created_at: string
}

export interface ChatUser {
  username: string
  display_name: string
}

export async function getWebchatRooms(username?: string): Promise<WebchatRoom[]> {
  const { data } = await api.get('/api/webchat/rooms', { params: username ? { username } : {} })
  return data
}

export async function createWebchatRoom(agentId: string, displayName: string, policy: 'open' | 'allowlist'): Promise<WebchatRoom> {
  const { data } = await api.post('/api/webchat/rooms', { agent_id: agentId, display_name: displayName, policy })
  return data
}

export async function updateWebchatRoom(id: number, fields: { display_name?: string; policy?: string; agent_id?: string }): Promise<void> {
  await api.put(`/api/webchat/rooms/${id}`, fields)
}

export async function deleteWebchatRoom(id: number): Promise<void> {
  await api.delete(`/api/webchat/rooms/${id}`)
}

export async function addWebchatRoomUser(roomId: number, username: string): Promise<void> {
  await api.post(`/api/webchat/rooms/${roomId}/users`, { username })
}

export async function removeWebchatRoomUser(roomId: number, username: string): Promise<void> {
  await api.delete(`/api/webchat/rooms/${roomId}/users/${username}`)
}

export async function getWebchatHistory(roomId: number, username: string): Promise<WebchatMessage[]> {
  const { data } = await api.get(`/api/webchat/history/${roomId}`, { params: { username } })
  return data
}

export async function sendWebchatMessage(roomId: number, username: string, message: string, signal?: AbortSignal): Promise<{ ok: boolean; reply: string }> {
  const { data } = await api.post('/api/webchat/send', { roomId, username, message }, { signal, timeout: 180_000 })
  return data
}

export async function getChatUsers(): Promise<ChatUser[]> {
  const { data } = await api.get('/api/webchat/chat-users')
  return data
}

// ─── Members ──────────────────────────────────────────────────────────────────
export interface Member {
  id: number
  username: string
  role: 'superadmin' | 'admin' | 'chat'
  display_name: string
  is_active: boolean
  created_at: string
}

export async function getMembers(): Promise<Member[]> {
  const { data } = await api.get('/api/members')
  return data
}

// ─── Analysis ─────────────────────────────────────────────────────────────────
export interface AnalysisStats {
  agents: Agent[]
  sessions: Record<string, ChatSession[]>
  members: Member[]
  webchatRooms: WebchatRoom[]
  webchatMessages: Record<number, WebchatMessage[]>
  logs: LogEntry[]
}

export interface LogEntry {
  time: string
  level: string
  subsystem: string
  msg: string
}

export async function getGatewayLogs(lines = 500): Promise<LogEntry[]> {
  const { data } = await api.get('/api/gateway/logs', { params: { lines } })
  return data
}

// ─── Monitor ──────────────────────────────────────────────────────────────────

export interface MonitorEvent {
  ts: string
  type: 'message' | 'thinking' | 'tool' | 'reply' | 'error' | string
  text: string
  agentId?: string
  channel?: string
  user?: string
  latency?: number
  inputTokens?: number
  outputTokens?: number
  cost?: number
  toolName?: string
  toolResult?: string
}

export interface MonitorSession {
  sessionKey: string
  user: string
  state: 'idle' | 'thinking' | 'tool_call' | 'replied' | 'error'
  lastMessageAt: string | null
  lastUserText: string | null
  lastReplyText: string | null
  elapsed: number
  cost: number
  inputTokens?: number
  outputTokens?: number
  events: MonitorEvent[]
}

export interface MonitorAgent {
  id: string
  channels: {
    webchat?: MonitorSession[]
    telegram?: MonitorSession[]
    line?: MonitorSession[]
  }
}

export interface MonitorStats {
  totalAgents: number
  activeNow: number
  todayMessages: number
  avgResponseTime: number
  totalCostToday: number
  errors: number
}

export interface MonitorData {
  agents: MonitorAgent[]
  globalEvents: MonitorEvent[]
  stats: MonitorStats
}

export async function getMonitorEvents(): Promise<MonitorData> {
  const { data } = await api.get('/api/monitor/events')
  return data
}

// ─── Session Replay ────────────────────────────────────────────────────────────

export interface SessionReplayToolCall {
  name: string
  input: unknown
  result?: string
}

export interface SessionReplayMessage {
  role: 'user' | 'assistant'
  timestamp: string
  text: string
  thinking?: string | null
  toolCalls?: SessionReplayToolCall[]
  usage?: { input: number; output: number; cost: number } | null
  latency?: number | null
  model?: string
  stopReason?: string
}

export interface SessionReplay {
  sessionId: string
  agentId: string
  messages: SessionReplayMessage[]
  stats: {
    turns: number
    inputTokens: number
    outputTokens: number
    totalCost: number
    avgLatency: number
  }
}

export async function getSessionReplay(agentId: string, sessionId: string): Promise<SessionReplay> {
  const { data } = await api.get(`/api/agents/${agentId}/sessions/${sessionId}`)
  return data
}

// ─── Cost Dashboard ────────────────────────────────────────────────────────────

export interface CostDayAgent {
  agentId: string
  cost: number
  inputTokens: number
  outputTokens: number
  turns: number
}

export interface CostDay {
  date: string
  agents: CostDayAgent[]
  total: number
}

export interface CostData {
  days: CostDay[]
  summary: { totalCost: number; byAgent: Record<string, number> }
}

export async function getMonitorCost(days = 30): Promise<CostData> {
  const { data } = await api.get('/api/monitor/cost', { params: { days } })
  return data
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookRoute {
  path: string
  sessionKey: string
  secret: string
  description?: string
  enabled?: boolean
}

export async function getWebhooks(): Promise<Record<string, WebhookRoute>> {
  const { data } = await api.get('/api/webhooks')
  return data
}

export async function addWebhook(body: { name: string; path: string; sessionKey: string; secret: string; description?: string }): Promise<void> {
  await api.post('/api/webhooks', body)
}

export async function deleteWebhook(name: string): Promise<void> {
  await api.delete(`/api/webhooks/${name}`)
}

export async function patchWebhook(name: string, fields: { enabled?: boolean; description?: string }): Promise<void> {
  await api.patch(`/api/webhooks/${name}`, fields)
}

// ─── Compaction Checkpoints ────────────────────────────────────────────────────

export interface CompactionCheckpoint {
  filename: string
  sessionId: string
  checkpointAt: string
  sizeBytes: number
}

export async function getCompactionCheckpoints(agentId: string): Promise<CompactionCheckpoint[]> {
  const { data } = await api.get(`/api/compaction/checkpoints/${agentId}`)
  return data
}

export async function restoreCheckpoint(agentId: string, filename: string): Promise<void> {
  await api.post('/api/compaction/restore', { agentId, filename })
}

// ─── Memory ────────────────────────────────────────────────────────────────────

export interface MemoryAgentStatus {
  agentId: string
  workspace: string
  memory: { exists: boolean; sizeChars: number; preview: string }
  dreams: { exists: boolean; sizeChars: number; preview: string }
  dreaming: { enabled: boolean; config: Record<string, unknown> | null }
}

export async function getMemoryStatus(): Promise<MemoryAgentStatus[]> {
  const { data } = await api.get('/api/memory/status')
  return data
}

export async function getMemoryContent(agentId: string): Promise<string> {
  const { data } = await api.get(`/api/memory/${agentId}/memory`)
  return data.content ?? ''
}

export async function getDreamsContent(agentId: string): Promise<string> {
  const { data } = await api.get(`/api/memory/${agentId}/dreams`)
  return data.content ?? ''
}

// ─── Alerting ─────────────────────────────────────────────────────────────────

export interface AlertingConfig {
  telegram: { enabled: boolean; chatId: string }
}

export async function getAlerting(): Promise<AlertingConfig> {
  const { data } = await api.get('/api/alerting')
  return data
}

export async function putAlerting(config: AlertingConfig): Promise<void> {
  await api.put('/api/alerting', config)
}

// ─── Sale Orders ──────────────────────────────────────────────────────────────

export interface SaleOrderItem {
  item_code: string
  qty: number
  unit_code: string
  price: number
}

export interface SaleOrder {
  id: string
  doc_no: string | null
  source: string
  agent_id: string | null
  contact_name: string | null
  contact_phone: string | null
  items: SaleOrderItem[]
  total_amount: string | null
  status: 'pending' | 'success' | 'failed'
  raw_request: unknown
  raw_response: unknown
  error_message: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface SaleOrdersResponse {
  orders: SaleOrder[]
  total: number
}

export async function getSaleOrders(params?: {
  status?: string
  source?: string
  agent_id?: string
  limit?: number
  offset?: number
}): Promise<SaleOrdersResponse> {
  const { data } = await api.get('/api/sale-orders', { params })
  return data
}

export async function getSaleOrder(id: string): Promise<SaleOrder> {
  const { data } = await api.get(`/api/sale-orders/${id}`)
  return data
}

export async function resendSaleOrder(id: string): Promise<{ ok: boolean; success: boolean; doc_no: string | null; error: string | null }> {
  const { data } = await api.post(`/api/sale-orders/${id}/resend`)
  return data
}
