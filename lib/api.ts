import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL!
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN!

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  },
})

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
  gateway?: { mode?: string }
}

export interface ProviderConfig {
  id: string
  label: string
  envKey: string
  modelPrefix: string
  listUrl?: string
  testUrl?: string
  authHeader?: 'bearer' | 'x-api-key'
  extraHeaders?: Record<string, string>
  models?: { id: string; name: string }[]  // hardcoded fallback
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    modelPrefix: 'openrouter',
    listUrl: 'https://openrouter.ai/api/v1/models',
    testUrl: 'https://openrouter.ai/api/v1/models',
    authHeader: 'bearer',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    modelPrefix: 'anthropic',
    testUrl: 'https://api.anthropic.com/v1/models',
    authHeader: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    modelPrefix: 'google',
    testUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    modelPrefix: 'openai',
    listUrl: 'https://api.openai.com/v1/models',
    testUrl: 'https://api.openai.com/v1/models',
    authHeader: 'bearer',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    modelPrefix: 'mistral',
    listUrl: 'https://api.mistral.ai/v1/models',
    testUrl: 'https://api.mistral.ai/v1/models',
    authHeader: 'bearer',
    models: [
      { id: 'mistral-small-2603', name: 'Mistral Small' },
      { id: 'mistral-medium-2505', name: 'Mistral Medium' },
      { id: 'mistral-large-2411', name: 'Mistral Large' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    modelPrefix: 'groq',
    testUrl: 'https://api.groq.com/openai/v1/models',
    authHeader: 'bearer',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'gemma2-9b-it', name: 'Gemma2 9B' },
    ],
  },
  {
    id: 'kilocode',
    label: 'Kilo AI',
    envKey: 'KILOCODE_API_KEY',
    modelPrefix: 'kilocode',
    testUrl: 'https://api.kilo.ai/api/gateway/v1/models',
    authHeader: 'bearer',
    models: [
      { id: 'kilo/auto', name: 'Kilo Auto' },
    ],
  },
]

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

export async function getModels(): Promise<OpenRouterModel[]> {
  const { data } = await api.get('/api/models')
  return data.data ?? data
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

export async function updateWebchatRoom(id: number, fields: { display_name?: string; policy?: string }): Promise<void> {
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

export async function sendWebchatMessage(roomId: number, username: string, message: string): Promise<{ ok: boolean; reply: string }> {
  const { data } = await api.post('/api/webchat/send', { roomId, username, message })
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
