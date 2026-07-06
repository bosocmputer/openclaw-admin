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
        fallbacks?: string[]
        timeoutMs?: number
      }
      imageModel?: {
        primary?: string
        fallbacks?: string[]
        timeoutMs?: number
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
  { id: 'ollama-cloud', label: 'Ollama Cloud', envKey: 'OLLAMA_API_KEY',     modelPrefix: 'ollama-cloud' },
]

export async function testProvider(provider: string, apiKey: string, signal?: AbortSignal): Promise<boolean> {
  const { data } = await api.post('/api/models/test', { provider, apiKey }, { signal })
  return !!data.ok
}

// ─── Anthropic OAuth ──────────────────────────────────────────────────────────

export async function startAnthropicOAuth(): Promise<{ url: string; instructions: string }> {
  const { data } = await api.post('/api/auth/anthropic/start')
  return data
}

export async function submitAnthropicOAuth(redirectUrl: string): Promise<{ message: string }> {
  // ใช้ /api/oauth/submit แทน proxy เพราะ callback page ไม่มี session
  const { data } = await api.post('/api/oauth/submit', { redirectUrl })
  return data
}

export interface OpenRouterModel {
  id: string
  name: string
  provider?: string
  contextLength?: number
  ownedBy?: string
  capabilities?: Record<string, unknown>
  pricing?: {
    prompt: string
    completion: string
    [key: string]: string | undefined
  }
}

export interface ModelCatalog {
  ok: boolean
  provider: string
  status: 'ready' | 'missing_key' | 'auth_error' | 'provider_error' | 'timeout' | 'unknown_provider' | string
  source: 'live' | 'cache' | 'not_configured' | 'provider' | 'none' | string
  cache: { hit: boolean; ttlSeconds: number }
  models: OpenRouterModel[]
  warnings: string[]
  summary?: string
  generatedAt?: string
}

export type ModelReadinessStatus =
  | 'ready'
  | 'not_configured'
  | 'missing_key'
  | 'auth_error'
  | 'provider_error'
  | 'invalid_output'
  | 'timeout'
  | 'unknown_provider'
  | 'model_not_found'
  | 'not_image_capable'
  | 'capability_unknown'
  | 'runtime_unverified'
  | 'runtime_verified'
  | 'runtime_unavailable'
  | string

export type ModelRuntimeTestStatus =
  | 'ok'
  | 'model_not_found'
  | 'missing_key'
  | 'auth_error'
  | 'timeout'
  | 'provider_error'
  | 'invalid_output'
  | 'runtime_unavailable'
  | 'runtime_verified'
  | string

export interface ModelRuntimeTestResult {
  ok: boolean
  status: ModelRuntimeTestStatus
  model: string
  selectedModel?: string | null
  targetMode?: 'chat_model' | 'image_model' | string
  catalogSupportsImage?: boolean | null
  catalogStatus?: string | null
  runtimeStatus?: string | null
  capability: 'text' | 'image' | string
  mode: 'gateway' | string
  runtimeVersion: string
  durationMs: number
  summary: string
  safeMessage: string
  expectedOutput?: string | null
  outputPreview?: string | null
  failureReason?: string | null
  testedAt?: string
  detail?: string
  cache?: { hit: boolean; ttlSeconds: number }
  attempts?: Array<{
    model: string
    ok: boolean
    status: ModelRuntimeTestStatus
    durationMs?: number
    safeMessage?: string
    outputPreview?: string | null
    runtimeVersion?: string | null
    catalogSupportsImage?: boolean | null
    catalogStatus?: string | null
  }>
  data?: {
    provider?: string | null
    model?: string | null
    outputPreview?: string
    attempts?: Array<Record<string, unknown>>
  } | null
}

export interface ModelImageUploadPayload {
  dataUrl?: string
  base64?: string
  mimeType: string
  fileName?: string
}

export interface ModelMessageTestAttempt {
  model: string
  ok: boolean
  status: ModelRuntimeTestStatus
  durationMs?: number
  safeMessage?: string
  outputPreview?: string | null
  runtimeVersion?: string | null
}

export interface ModelMessageTestResult {
  ok: boolean
  status: ModelRuntimeTestStatus
  selectedModel: string | null
  durationMs: number
  safeMessage?: string
  outputPreview?: string | null
  attempts: ModelMessageTestAttempt[]
}

export interface ModelRefReadiness {
  ref: string
  role: string
  status: ModelReadinessStatus
  summary: string
  provider: string | null
  modelId: string | null
  source: string | null
  catalogStatus: string | null
  capability: string | null
  keyStatus: string | null
  runtimeStatus: string | null
  runtimeSummary: string | null
  runtimeTestedAt: string | null
  runtimeDurationMs: number | null
  runtimeVersion: string | null
  configured: boolean
}

export interface ModelChainReadiness {
  primary: ModelRefReadiness
  fallbacks: ModelRefReadiness[]
  timeoutMs: number | null
  configured: boolean
}

export interface AgentModelReadiness {
  id: string
  modelSource: 'agent' | 'defaults'
  imageModelSource: 'agent' | 'defaults'
  usesImageTool: boolean
  model: ModelChainReadiness
  imageModel: ModelChainReadiness
}

export interface ModelReadinessIssue {
  scope: string
  ref: string
  status: ModelReadinessStatus
  summary: string
  capability: string | null
}

export interface ModelReadinessWarning {
  id: string
  status: string
  summary: string
}

export interface ModelReadiness {
  ok: boolean
  generatedAt: string
  cache: { hit: boolean; ttlSeconds: number }
  defaults: {
    model: ModelChainReadiness
    imageModel: ModelChainReadiness
  }
  agents: AgentModelReadiness[]
  providers: Record<string, {
    status: string
    source: string
    cache?: { hit: boolean; ttlSeconds: number }
    modelCount: number
    warnings: string[]
    summary: string
  }>
  warnings: ModelReadinessWarning[]
  blockingIssues: ModelReadinessIssue[]
  runtimeVerificationIssues?: ModelReadinessIssue[]
}

export interface ModelSettingsChain {
  primary: string
  fallbacks?: string[]
  timeoutMs?: number
}

export interface ModelSettingsPayload {
  defaults?: {
    model?: ModelSettingsChain | null
    imageModel?: ModelSettingsChain | null
  }
  agents?: Record<string, {
    model?: ModelSettingsChain | null
    imageModel?: ModelSettingsChain | null
  }>
  allowRuntimeOverride?: boolean
}

export interface ModelSettingsResult {
  ok: boolean
  validateOnly?: boolean
  runtimeOverride?: boolean
  write?: { ok: boolean; backupId: string; backupPath: string | null; bytes: number; reason: string }
  readiness: ModelReadiness
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

export interface ChannelBindingApplyResult {
  ok: boolean
  stage?: 'validate' | 'resetSessions' | 'restartGateway' | 'ready'
  channel?: 'line' | 'telegram'
  accountId?: string
  oldAgentId?: string | null
  newAgentId?: string
  changed?: boolean
  config?: { ok?: boolean; backupPath?: string | null }
  reset?: { agentId: string; removed: number; backupPath?: string | null }[]
  restart?: {
    ok?: boolean
    method?: string
    stdout?: string
    stderr?: string
    error?: string
  } | null
  durationMs?: number
  safeMessage?: string
  error?: string
}

export async function applyChannelBinding(payload: {
  channel: 'line' | 'telegram'
  accountId: string
  agentId: string
  resetSessions?: boolean
  restartGateway?: boolean
}): Promise<ChannelBindingApplyResult> {
  const { data } = await api.post('/api/channel-bindings/apply', payload)
  return data
}

export async function getTelegramBotInfo(): Promise<Record<string, string>> {
  const { data } = await api.get('/api/telegram/botinfo')
  return data
}

export interface TelegramBotStatus {
  online: boolean
  name: string | null
  username: string | null
}

export async function getTelegramStatus(): Promise<Record<string, TelegramBotStatus>> {
  const { data } = await api.get('/api/telegram/status')
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

export interface LineDeliveryStatsPart {
  status: 'ok' | 'unavailable' | string
  count?: number | null
  value?: number | null
  totalUsage?: number | null
  reason?: string
}

export interface LineDeliveryStats {
  ok: boolean
  status: 'ok' | 'unavailable' | string
  accountId: string
  date: string
  quota?: LineDeliveryStatsPart
  consumption?: LineDeliveryStatsPart
  reply?: LineDeliveryStatsPart
  push?: LineDeliveryStatsPart
  checkedAt?: string
  safeMessage?: string
  cache?: { hit: boolean; ttlSeconds: number }
}

export async function getLineDeliveryStats(accountId: string, date?: string): Promise<LineDeliveryStats> {
  const { data } = await api.get('/api/line/delivery-stats', {
    params: { accountId, ...(date ? { date } : {}) },
  })
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
  required?: string[]
  args?: string[]
}

export interface AgentCapability {
  id: string
  label: string
  description: string
  toolNames: string[]
  missingToolNames: string[]
  summary: string
}

export interface AgentSoulTemplate {
  soul: string
  accessMode: string
  persona: string
  mcpUrl?: string | null
  toolSource: 'live' | 'fallback'
  tools: McpTool[]
  capabilities: AgentCapability[]
  deniedCapabilities: AgentCapability[]
  warnings: string[]
  businessProfile?: BusinessProfile | null
  businessProfileHash?: string | null
  businessProfileApplied?: boolean
  nativeCapabilities?: string[]
  nativeContractStatus?: 'included' | 'not_required' | string
  generatedAt: string
  cache?: { hit: boolean; ttlSeconds: number }
}

export interface BusinessProfile {
  id: string
  name: string
  nameTh: string
  businessType: string
  summary: string
  customerQuestionPatterns: string[]
  mainCategories: string[]
  synonyms: string[]
  safetyRules: string[]
  soulBlock: string
  soulBlockHash: string
  soulBlockChars?: number
  agentIds?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface BusinessProfileTemplate extends Omit<BusinessProfile, 'id'> {
  templateId: string
}

export interface AgentBusinessProfileState {
  profile: BusinessProfile | null
  link: {
    profileId: string
    agentId: string
    lastAppliedHash: string | null
    lastAppliedAt: string | null
    createdAt?: string
    updatedAt?: string
  } | null
  isApplied: boolean
}

export async function testAgentMcp(agentId: string, accessMode: string): Promise<{
  ok: boolean
  serverName: string
  accessMode: string
  tools: McpTool[]
  capabilities?: AgentCapability[]
  deniedCapabilities?: AgentCapability[]
  toolSource?: 'live' | 'fallback'
  warnings?: string[]
  raw?: string
  error?: string
}> {
  const { data } = await api.post(`/api/agents/${agentId}/mcp/test`, { accessMode })
  return data
}

export async function getAgentSoulTemplate(agentId: string, persona: string, refreshTools = false): Promise<AgentSoulTemplate> {
  const { data } = await api.get(`/api/agents/${agentId}/soul/template`, { params: { persona, refreshTools } })
  return data
}

export async function getBusinessProfiles(): Promise<BusinessProfile[]> {
  const { data } = await api.get('/api/business-profiles')
  return data
}

export async function getBusinessProfileTemplates(): Promise<BusinessProfileTemplate[]> {
  const { data } = await api.get('/api/business-profiles/templates')
  return data
}

export async function createBusinessProfile(profile: Omit<BusinessProfile, 'id' | 'soulBlockHash' | 'createdAt' | 'updatedAt' | 'agentIds'>): Promise<BusinessProfile> {
  const { data } = await api.post('/api/business-profiles', profile)
  return data
}

export async function updateBusinessProfile(id: string, profile: Omit<BusinessProfile, 'id' | 'soulBlockHash' | 'createdAt' | 'updatedAt' | 'agentIds'>): Promise<BusinessProfile> {
  const { data } = await api.put(`/api/business-profiles/${id}`, profile)
  return data
}

export async function deleteBusinessProfile(id: string): Promise<void> {
  await api.delete(`/api/business-profiles/${id}`)
}

export async function linkBusinessProfileToAgent(profileId: string, agentId: string): Promise<void> {
  await api.post(`/api/business-profiles/${profileId}/link-agent`, { agentId })
}

export async function unlinkBusinessProfileFromAgent(profileId: string, agentId: string): Promise<void> {
  await api.delete(`/api/business-profiles/${profileId}/link-agent/${agentId}`)
}

export async function getAgentBusinessProfile(agentId: string): Promise<AgentBusinessProfileState> {
  const { data } = await api.get(`/api/agents/${agentId}/business-profile`)
  return data
}

export async function resetAgentSessions(agentId: string): Promise<{ ok: boolean; removed: number; backupPath: string | null }> {
  const { data } = await api.post(`/api/agents/${agentId}/sessions/reset-active`, { reason: 'soul-template-contract-change' })
  return data
}

export async function getModelCatalog(provider: string, refresh = false): Promise<ModelCatalog> {
  const { data } = await api.get('/api/models/catalog', { params: refresh ? { provider, refresh: true } : { provider } })
  return data
}

export async function getModels(provider: string): Promise<OpenRouterModel[]> {
  const data = await getModelCatalog(provider)
  return data.models ?? []
}

export async function getModelReadiness(refresh = false): Promise<ModelReadiness> {
  const { data } = await api.get('/api/models/readiness', { params: refresh ? { refresh: true } : {} })
  return data
}

export async function testModelRuntime(params: {
  model: string
  capability?: 'text' | 'image'
  mode?: 'gateway'
  refresh?: boolean
}, signal?: AbortSignal): Promise<ModelRuntimeTestResult> {
  const { data } = await api.post('/api/models/runtime-test', params, { signal })
  return data
}

export async function testModelMessage(params: {
  primary: string
  fallbacks?: string[]
  prompt: string
  capability?: 'text'
}, signal?: AbortSignal): Promise<ModelMessageTestResult> {
  const { data } = await api.post('/api/models/message-test', params, { signal })
  return data
}

export async function testModelImageMessage(params: {
  model?: string
  fallbacks?: string[]
  targetMode?: 'chat_model' | 'image_model'
  prompt: string
  image: ModelImageUploadPayload
}, signal?: AbortSignal): Promise<ModelRuntimeTestResult> {
  const { data } = await api.post('/api/models/image-message-test', params, { signal })
  return data
}

export async function putModelSettings(payload: ModelSettingsPayload, validateOnly = false, allowRuntimeOverride = false): Promise<ModelSettingsResult> {
  const { data } = await api.put('/api/models/settings', payload, {
    params: {
      ...(validateOnly ? { validateOnly: true } : {}),
      ...(allowRuntimeOverride ? { allowRuntimeOverride: true } : {}),
    },
  })
  return data
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
  timestamp?: string | null
  timeMs?: number | null
  type: 'message' | 'thinking' | 'tool' | 'reply' | 'error' | string
  text: string
  agentId?: string
  channel?: string
  user?: string
  latency?: number
  inputTokens?: number
  outputTokens?: number
  cost?: number
  model?: string | null
  provider?: string | null
  modelSource?: 'actual' | 'configured' | string | null
  finishReason?: string | null
  toolName?: string
  toolNamespace?: string | null
  toolBaseName?: string | null
  toolDisplayName?: string | null
  toolInput?: string
  toolResult?: string
  cleanKeyword?: string
  intent?: string
  route?: string
  media?: MonitorMedia[]
  marker?: string
  method?: 'reply' | 'push' | 'loading' | string
  deliveryMethod?: 'reply' | 'push' | 'loading' | string
  accountId?: string
  chatType?: 'user' | 'group' | 'room' | 'unknown' | string
  messageCount?: number | null
  durationMs?: number | null
  replyTokenAgeMs?: number | null
  fallbackReason?: string | null
  flushReason?: string | null
  loadingSeconds?: number | null
  eventCount?: number | null
  mediaCount?: number | null
  textCount?: number | null
  waitMs?: number | null
}

export interface MonitorMedia {
  id?: string | null
  kind: 'image' | 'file' | string
  mimeType: string
  fileName?: string
  sizeBytes?: number
  caption?: string
  hasPreview: boolean
  previewUrl?: string
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
  warnings?: { type: string; toolName?: string; count?: number; summary: string }[]
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

export interface MonitorConversationTool {
  name: string
  status?: string
  argsPreview?: string
  resultSummary?: string
  durationMs?: number | null
}

export interface MonitorConversationTurn {
  id: string
  source: 'session' | 'gateway' | string
  sessionKey?: string
  startedAt: string
  agentId: string | null
  channel: 'webchat' | 'telegram' | 'line' | string
  user: string
  userText: string
  finalText: string
  route: 'native' | 'capability_denied' | 'tool_path' | 'model_path' | 'quality_fallback' | string
  intent: string
  status: 'ok' | 'pending' | 'warn' | 'error' | 'skipped' | string
  rootCause?: string | null
  durationMs?: number | null
  ackMs?: number | null
  modelMs?: number | null
  media?: MonitorMedia[]
  mediaCount?: number
  toolPath: MonitorConversationTool[]
  warnings: { type: string; issue?: string; toolName?: string; summary: string }[]
}

export interface MonitorConversationData {
  generatedAt: string
  windowMinutes: number
  summary: {
    count: number
    byStatus: Record<string, number>
    byRoute: Record<string, number>
    avgDurationMs: number | null
  }
  turns: MonitorConversationTurn[]
  warnings: { type: string; summary: string }[]
}

export async function getMonitorConversations(params: { minutes?: number; agent?: string; channel?: 'telegram' | 'line' | 'webchat'; limit?: number } = {}): Promise<MonitorConversationData> {
  const { data } = await api.get('/api/monitor/conversations', { params })
  return data
}

export interface MonitorLatencyTurn {
  turnId: string
  agentId?: string
  channel: 'telegram'
  startedAt?: string
  chatIdRedacted?: string
  mediaCount?: number
  ackMs: number | null
  contextMs: number | null
  modelMs: number | null
  finalMs: number | null
  status: 'ok' | 'slow' | 'pending' | 'stuck' | 'warn' | 'suppressed'
  rootCause: string
  toolCalls: { count?: number | null; elapsedMs?: number | null }[]
}

export interface MonitorLatencyData {
  generatedAt: string
  windowMinutes: number
  summary: {
    count: number
    ackP50Ms: number | null
    ackP95Ms: number | null
    finalP50Ms: number | null
    finalP95Ms: number | null
    byStatus: Record<string, number>
    slo: { ackP95Ok: boolean | null; finalTextP95Ok: boolean | null }
  }
  turns: MonitorLatencyTurn[]
  slowest: MonitorLatencyTurn[]
  warnings: { type: string; summary: string }[]
}

export async function getMonitorLatency(params: { minutes?: number; agent?: string; channel?: 'telegram' } = {}): Promise<MonitorLatencyData> {
  const { data } = await api.get('/api/monitor/latency', { params })
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
  provider?: string | null
  modelSource?: 'actual' | 'configured' | string | null
  stopReason?: string
}

export interface SessionReplay {
  sessionId: string
  agentId: string
  messages: SessionReplayMessage[]
  warnings?: { type: string; toolName?: string; count?: number; summary: string }[]
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

// ─── Conversation Analysis ────────────────────────────────────────────────────

export interface ConversationAnalysisSummary {
  count: number
  uniqueUsers: number
  issueCount: number
  modelTurns: number
  toolOnlyTurns: number
  totalCost: number
  inputTokens: number
  outputTokens: number
  avgDurationMs: number | null
  p50DurationMs: number | null
  p95DurationMs: number | null
  byStatus: Record<string, number>
  byRoute: Record<string, number>
  byIntent: Record<string, number>
}

export interface ConversationAnalysisTurn {
  id: string
  source: string
  sessionKey?: string | null
  startedAt: string
  agentId: string | null
  channel: string
  user: string
  userText: string
  finalText: string
  route: string
  intent: string
  status: string
  rootCause?: string | null
  durationMs?: number | null
  ackMs?: number | null
  modelMs?: number | null
  model?: string | null
  provider?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  cost?: number | null
  toolCount: number
  warningCount: number
  media?: MonitorMedia[]
  mediaCount?: number
  hasMedia?: boolean
  issues: ConversationIssue[]
  issueTags: string[]
  reviewTargets: string[]
  primaryIssueTag?: string | null
  primaryReviewTarget?: string | null
}

export interface ConversationIssue {
  tag: string
  label: string
  reviewTarget: string
  severity: string
  evidence: Record<string, unknown>
}

export interface ConversationAnalysisEvent {
  type: string
  occurredAt: string
  title: string
  body: string
  payload: Record<string, unknown>
}

export interface ConversationAnalysisData {
  generatedAt: string
  filters: Record<string, unknown>
  summary: ConversationAnalysisSummary
  turns: ConversationAnalysisTurn[]
  hasMore: boolean
  nextCursor: string | null
  warnings: { type: string; summary: string }[]
}

export interface ConversationAnalysisDetail {
  turn: ConversationAnalysisTurn
  events: ConversationAnalysisEvent[]
  learningSignals?: MemoryObservation[]
  memoryUsage?: MemoryUsageEvent[]
  memoryDecisions?: Array<{
    observationId: string
    type: MemoryType
    risk: string
    decision: string
    reason: string
    safeToPromote?: boolean
    blockedReason?: string | null
  }>
}

export interface ConversationInsightItem {
  key: string
  count: number
  label?: string
  reviewTarget?: string | null
}

export interface ConversationInsights {
  generatedAt: string
  filters: Record<string, unknown>
  scanned: number
  summary: {
    totalTurns: number
    issueTurns: number
    issueRate: number
    slowTurns: number
    slowP95Ms: number | null
    noResultTurns: number
    toolErrorTurns: number
    agentsNeedingReview: number
  }
  topIssueTags: ConversationInsightItem[]
  topFailedKeywords: ConversationInsightItem[]
  toolFailures: ConversationInsightItem[]
  agentBreakdown: ConversationInsightItem[]
  reviewTargets: ConversationInsightItem[]
  examples: Array<{
    id: string
    startedAt: string
    agentId: string | null
    channel: string
    userText: string
    finalText: string
    issueTags: string[]
    reviewTargets: string[]
    durationMs?: number | null
  }>
  warnings: { type: string; summary: string }[]
}

export interface ConversationIngestStatus {
  enabled: boolean
  retentionDays: number
  workerRunning: boolean
  turns: { count: number; from: string | null; to: string | null }
  checkpoints: Array<Record<string, unknown>>
  recentExports: Array<Record<string, unknown>>
}

export interface ConversationBackfillResult {
  ok: boolean
  dryRun?: boolean
  disabled?: boolean
  imported: number
  skipped: number
  discovered?: number
  days?: number
  reason?: string
}

export interface ConversationAnalysisParams {
  from?: string
  to?: string
  agent?: string
  channel?: string
  user?: string
  intent?: string
  route?: string
  status?: string
  model?: string
  q?: string
  issueTag?: string
  reviewTarget?: string
  learningDecision?: string
  hasToolError?: boolean
  slowOnly?: boolean
  hasMedia?: boolean
  limit?: number
  cursor?: string | null
}

export async function getConversationAnalysis(params: ConversationAnalysisParams = {}): Promise<ConversationAnalysisData> {
  const { data } = await api.get('/api/analysis/conversations', { params })
  return data
}

export async function getConversationInsights(params: ConversationAnalysisParams = {}): Promise<ConversationInsights> {
  const { data } = await api.get('/api/analysis/conversations/insights', { params })
  return data
}

export async function getConversationAnalysisDetail(turnId: string): Promise<ConversationAnalysisDetail> {
  const { data } = await api.get(`/api/analysis/conversations/${encodeURIComponent(turnId)}`)
  return data
}

export async function getConversationIngestStatus(): Promise<ConversationIngestStatus> {
  const { data } = await api.get('/api/analysis/conversations/ingest-status')
  return data
}

export async function backfillConversations(body: { days?: number; from?: string; to?: string; agent?: string; channel?: string; dryRun?: boolean } = {}): Promise<ConversationBackfillResult> {
  const { data } = await api.post('/api/analysis/conversations/backfill', body)
  return data
}

export async function exportConversationAnalysis(params: ConversationAnalysisParams & { format?: 'csv' | 'jsonl' | 'markdown'; mode?: 'raw' | 'codex_review_pack' | 'learning_review_pack' | 'issues_csv' | 'events_jsonl' }): Promise<Blob> {
  const { data } = await api.get('/api/analysis/conversations/export', { params, responseType: 'blob' })
  return data
}

// ─── Dashboard Overview ───────────────────────────────────────────────────────

export interface DashboardRelease {
  installedVersion: string | null
  latestVersion: string | null
  targetVersion: string
  nodeVersion?: string
  npmRoot?: string | null
  runtimeRoot?: string | null
  status: 'behind' | 'current' | 'custom' | 'unknown' | string
  warnings: string[]
  deployMetadataPresent?: boolean
  customMarkers?: Record<string, boolean>
  generatedAt?: string
}

export interface DashboardHealthSummary {
  status: 'ok' | 'warn' | 'fail' | string
  criticalFail: number
  warn: number
  ok: number
  fail: number
  info: number
  total: number
  warnings: { id: string; label: string; status: string; summary: string }[]
}

export interface DashboardOperations {
  gateway?: 'online' | 'offline' | string
  agents?: number
  telegramBotsConfigured?: number
  telegramBotsOnline?: number
  lineAccounts?: number
  webchatRooms?: number | null
  members?: number | null
  defaultModel?: string | null
}

export interface DashboardLatencySummary {
  windowMinutes?: number
  turns: number
  active: number
  stuck: number
  ackP50Ms?: number | null
  ackP95Ms?: number | null
  finalP50Ms?: number | null
  finalP95Ms?: number | null
  byStatus: Record<string, number>
  routeBreakdown: Record<string, number>
}

export interface DashboardCostSummary {
  days: number
  totalCost: number
  modelCalls: number
  inputTokens: number
  outputTokens: number
  toolOnlyTurns: number
  byAgent: { agentId: string; cost: number }[]
}

export interface DashboardAgentRow {
  id: string
  accessMode: string
  mcpUrl: string | null
  toolCount: number
  toolSource: string
  soulStatus: string
  authStatus: string
  fallbackModelCount: number
  channels: { telegram: number; line: number; webchat: number }
}

export interface DashboardRecentTurn {
  id: string
  startedAt: string
  agentId: string | null
  channel: string
  user: string
  userText: string
  finalText: string
  route: string
  intent: string
  status: string
  durationMs: number | null
  toolChain: string[]
  warnings: string[]
}

export interface DashboardWhatsNewItem {
  id: string
  title: string
  summary: string
  action: string
  status: string
}

export interface DashboardOverview {
  ok: boolean
  generatedAt: string
  cache: { hit: boolean; ttlSeconds: number }
  release: DashboardRelease
  health: DashboardHealthSummary
  operations: DashboardOperations
  latency: DashboardLatencySummary
  cost: DashboardCostSummary
  agents: DashboardAgentRow[]
  recentTurns: DashboardRecentTurn[]
  runtimeGuardrails?: {
    root?: string | null
    source?: string | null
    markers?: Record<string, boolean>
    markerMissing?: string[]
    telegramRegression?: {
      passedAt?: string | null
      fresh?: boolean
      note?: string
      runtimeRoot?: string | null
      markerMissing?: string[]
    }
  }
  whatsNew: { version: string; items: DashboardWhatsNewItem[] }
}

export async function getDashboardOverview(refresh = false): Promise<DashboardOverview> {
  const { data } = await api.get('/api/dashboard/overview', { params: refresh ? { refresh: true } : {} })
  return data
}

export async function markTelegramRegressionPassed(note = 'dashboard-confirmed'): Promise<{ ok: boolean; state?: unknown }> {
  const { data } = await api.post('/api/dashboard/telegram-regression/pass', { note })
  return data
}

export async function acknowledgeTelegramBindingIntent(body: {
  accountId: string
  agentId: string
  note?: string
}): Promise<{ ok: boolean; acknowledgement?: { accountId: string; agentId: string; note?: string; acknowledgedAt?: string } }> {
  const { data } = await api.post('/api/system/telegram-binding-intent/ack', body)
  return data
}

// ─── System Health ───────────────────────────────────────────────────────────

export type SystemCheckStatus = 'ok' | 'warn' | 'fail' | 'info'
export type SystemCheckSeverity = 'critical' | 'warn' | 'info'

export interface SystemHealthCheck {
  id: string
  label: string
  status: SystemCheckStatus
  severity: SystemCheckSeverity
  summary: string
  durationMs: number
  remediation?: string
  warnings?: Array<{
    id?: string
    status?: string
    summary?: string
    ref?: string
    capability?: string | null
    accountId?: string
    agentId?: string
    key?: string
  }>
  accepted?: Array<{
    accountId?: string
    agentId?: string
    key?: string
    acknowledgedAt?: string
    note?: string
  }>
  nativeCapabilities?: string[]
  nativeMediaStatus?: 'ok' | 'missing' | 'not_required' | string
  profileId?: string
  profileHash?: string
  lastAppliedHash?: string | null
  publicUrl?: string
  accounts?: Array<{ id?: string; accountId?: string; webhookPath?: string }>
}

export interface SystemHealthAgent {
  id: string
  accessMode: string
  mcpUrl: string
  toolCount: number
  toolSource?: string
  soulStatus: SystemCheckStatus
  authStatus: SystemCheckStatus
}

export interface SystemHealth {
  ok: boolean
  status: 'ok' | 'warn' | 'fail'
  generatedAt: string
  cache: { hit: boolean; ttlSeconds: number }
  checks: SystemHealthCheck[]
  agents: SystemHealthAgent[]
}

export interface SupportBundle {
  generatedAt: string
  durationMs: number
  health: SystemHealth
  releaseState?: {
    generatedAt: string
    metadataPath: string
    config?: { path: string; sha256?: string | null }
    distFiles?: { name: string; path: string; size?: number; mtime?: string; sha256?: string | null; missing?: boolean }[]
  }
  latencySummary?: MonitorLatencyData['summary']
  recentSlowTurns?: MonitorLatencyTurn[]
  recentGuardrailWarnings?: {
    type: string
    guardrail?: string
    turnId?: string
    agentId?: string
    chatIdRedacted?: string
    summary: string
  }[]
  recentToolLoopWarnings?: {
    agentId: string
    sessionKey: string
    toolName: string
    count: number
  }[]
  repos: {
    name: string
    cwd: string
    branch?: string
    head?: string
    status?: string[]
    error?: string
  }[]
  processStatus: {
    name: string
    pid: number
    status?: string
    restarts?: number
    uptime?: number
  }[]
  runtime: { node: string; platform: string; arch: string }
}

export async function getSystemHealth(refresh = false): Promise<SystemHealth> {
  const { data } = await api.get('/api/system/health', { params: refresh ? { refresh: true } : {} })
  return data
}

export async function getSupportBundle(): Promise<SupportBundle> {
  const { data } = await api.get('/api/system/support-bundle')
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
  memory: {
    exists: boolean
    sizeChars: number
    preview: string
    estimatedTokens?: number
    sizeWarning?: 'ok' | 'warn' | 'block' | string
    injectedLikely?: 'missing' | 'full' | 'truncated' | string
    bootstrapMaxChars?: number
  }
  dreams: { exists: boolean; sizeChars: number; preview: string; path?: string | null; canonicalName?: string }
  dailyMemory?: {
    fileCount: number
    totalChars: number
    latestDate: string | null
    latestPreview: string
    files: string[]
  }
  dreaming: { enabled: boolean; config: Record<string, unknown> | null; source?: string }
  autoLearn?: {
    autoLearnMode: MemoryPolicyMode
    activeMemoryCount: number
    softMemoryCount: number
    blockedCount: number
    deletedCount: number
    estimatedInjectedChars: number
    maxContextChars: number
    memoryHealth?: MemoryHealth
  }
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

export async function getDailyMemoryContent(agentId: string, filename: string): Promise<string> {
  const { data } = await api.get(`/api/memory/${encodeURIComponent(agentId)}/daily/${encodeURIComponent(filename)}`)
  return data.content ?? ''
}

export type MemoryType = 'terminology' | 'preference' | 'workflow_hint' | 'faq_pattern' | 'entity_alias' | 'staff_instruction' | 'blocked_fact'
export type MemoryScope = 'session' | 'contact' | 'agent' | 'business' | 'global'
export type AgentMemoryStatus = 'active' | 'soft' | 'blocked' | 'deleted'
export type MemoryPolicyMode = 'off' | 'observe_only' | 'safe_auto' | 'manual_review'
export type MemoryObservationStatus = 'observed' | 'promoted' | 'blocked' | 'ignored'

export interface MemoryHealth {
  noiseCount: number
  duplicateCount: number
  dynamicFactCount: number
  vagueTeachingCount: number
  overBudget: boolean
  injectedChars: number
  activeButNotInjectedCount: number
  totalActiveChars: number
}

export interface AgentMemory {
  id: string
  agentId: string
  status: AgentMemoryStatus
  type: MemoryType
  scope: MemoryScope
  content: string
  sourceAuthority: string
  confidence: number | null
  evidence: Record<string, unknown>
  sourceTurnIds: string[]
  ttlExpiresAt?: string | null
  lastUsedAt?: string | null
  usageCount: number
  createdBy?: string | null
  updatedBy?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface MemoryObservation {
  id: string
  agentId: string
  type: MemoryType
  scope: MemoryScope
  summary: string
  evidence: Record<string, unknown>
  sourceTurnId?: string | null
  risk: 'low' | 'medium' | 'high' | string
  recommendedAction: string
  decision?: string
  decisionReason?: string
  safeToPromote?: boolean
  blockedReason?: string | null
  status: MemoryObservationStatus
  confidence: number | null
  createdAt: string
  updatedAt: string
}

export interface MemoryPolicy {
  agentId: string
  mode: MemoryPolicyMode
  maxContextChars: number
  safeTypes: MemoryType[]
  allowChatTeaching: boolean
  retentionDays: number | null
  updatedBy?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  autoApplyResult?: MemoryAutoApplyResult
}

export interface MemoryAutoApplyResult {
  ok: boolean
  agentId: string
  mode: MemoryPolicyMode | string
  scanned: number
  promoted: number
  blocked: number
  skipped: number
  error?: string
}

export interface MemoryUsageEvent {
  id: number
  turnId?: string | null
  memoryId?: string | null
  agentId?: string | null
  injectedChars: number
  relevanceScore: number | null
  outcome?: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export async function getAgentMemories(params: {
  agentId?: string
  status?: AgentMemoryStatus | string
  type?: MemoryType | string
  scope?: MemoryScope | string
  q?: string
  limit?: number
} = {}): Promise<{ memories: AgentMemory[] }> {
  const { data } = await api.get('/api/memory/memories', { params })
  return data
}

export async function createAgentMemory(body: {
  agentId: string
  status?: AgentMemoryStatus
  type: MemoryType
  scope: MemoryScope
  content: string
  sourceAuthority?: string
  confidence?: number | null
  evidence?: Record<string, unknown>
  sourceTurnIds?: string[]
}): Promise<AgentMemory> {
  const { data } = await api.post('/api/memory/memories', body)
  return data
}

export async function updateAgentMemory(id: string, body: Partial<Pick<AgentMemory, 'status' | 'type' | 'scope' | 'content' | 'confidence' | 'evidence'>>): Promise<AgentMemory> {
  const { data } = await api.patch(`/api/memory/memories/${encodeURIComponent(id)}`, body)
  return data
}

export async function deleteAgentMemory(id: string, blockRelearn = true): Promise<{ memory: AgentMemory; tombstone?: Record<string, unknown> | null }> {
  const { data } = await api.delete(`/api/memory/memories/${encodeURIComponent(id)}`, { params: { blockRelearn } })
  return data
}

export async function blockMemoryRelearn(id: string, reason?: string): Promise<{ memory: AgentMemory; tombstone: Record<string, unknown> }> {
  const { data } = await api.post(`/api/memory/memories/${encodeURIComponent(id)}/block-relearn`, { reason })
  return data
}

export async function getMemoryObservations(params: {
  agentId?: string
  status?: MemoryObservationStatus | string
  type?: MemoryType | string
  q?: string
  sourceTurnId?: string
  limit?: number
} = {}): Promise<{ observations: MemoryObservation[] }> {
  const { data } = await api.get('/api/memory/observations', { params })
  return data
}

export async function promoteMemoryObservation(id: string, body: {
  status?: AgentMemoryStatus
  type?: MemoryType
  scope?: MemoryScope
  content?: string
  confidence?: number | null
} = {}): Promise<{ observation: MemoryObservation; memory: AgentMemory }> {
  const { data } = await api.post(`/api/memory/observations/${encodeURIComponent(id)}/promote`, body)
  return data
}

export async function getMemoryPolicies(): Promise<{ policies: MemoryPolicy[] }> {
  const { data } = await api.get('/api/memory/policies')
  return data
}

export async function putMemoryPolicy(agentId: string, body: Partial<MemoryPolicy>): Promise<MemoryPolicy> {
  const { data } = await api.put(`/api/memory/policies/${encodeURIComponent(agentId)}`, body)
  return data
}

export async function applyMemoryAutoLearn(agentId: string, limit = 200): Promise<MemoryAutoApplyResult> {
  const { data } = await api.post(`/api/memory/policies/${encodeURIComponent(agentId)}/apply-auto-learn`, { limit })
  return data
}

export interface MemoryCleanupAction {
  memoryId: string
  agentId: string
  status: AgentMemoryStatus | string
  type: MemoryType | string
  action: 'keep' | 'delete' | 'block' | 'soften' | 'delete_duplicate' | string
  reason: string
  categories: string[]
  tombstone: boolean
  contentPreview: string
  nextStatus?: string
}

export interface MemoryCleanupResult {
  ok: boolean
  dryRun: boolean
  agentId: string
  summary: {
    scanned: number
    keep: number
    delete: number
    block: number
    soften: number
    deleteDuplicate: number
    duplicateCount: number
    noiseCount: number
    dynamicFactCount: number
    vagueTeachingCount: number
    tombstoneCount: number
  }
  examples: Record<string, Array<{ memoryId: string; action: string; reason: string; contentPreview: string }>>
  actions: MemoryCleanupAction[]
  backup?: { backupId: string; fileName: string; existed: boolean } | null
  applied?: MemoryCleanupAction[]
  errors?: Array<{ memoryId: string; action: string; error: string }>
  syncResult?: Record<string, unknown>
}

export async function cleanupMemory(agentId: string, dryRun = true): Promise<MemoryCleanupResult> {
  const { data } = await api.post('/api/memory/maintenance/cleanup', { agentId, dryRun })
  return data
}

export async function getMemoryUsage(params: { turnId?: string; agentId?: string; limit?: number } = {}): Promise<{ usage: MemoryUsageEvent[] }> {
  const { data } = await api.get('/api/memory/usage', { params })
  return data
}

export type MemoryLearningTargetType = 'memory' | 'business_profile' | 'soul' | 'mcp_search' | 'model_runtime'
export type MemoryLearningStatus = 'pending' | 'approved' | 'applied' | 'rejected'

export interface MemoryLearningCandidate {
  id: string
  agentId: string
  targetType: MemoryLearningTargetType
  summary: string
  evidence: unknown[]
  sourceTurnIds: string[]
  status: MemoryLearningStatus
  confidence: number | null
  sourceHash: string
  createdBy?: string | null
  updatedBy?: string | null
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
  appliedAt?: string | null
  rejectedAt?: string | null
  appliedResult?: Record<string, unknown> | null
  deduped?: boolean
}

export interface MemoryLearningCandidatesResponse {
  enabled: boolean
  candidates: MemoryLearningCandidate[]
}

export interface MemoryBackup {
  backupId: string
  fileName: string
  sizeBytes: number
  createdAt: string
}

export async function getMemoryLearningCandidates(params: {
  agentId?: string
  status?: string
  targetType?: string
  limit?: number
} = {}): Promise<MemoryLearningCandidatesResponse> {
  const { data } = await api.get('/api/memory/learning-candidates', { params })
  return data
}

export async function createMemoryLearningCandidate(body: {
  agentId: string
  targetType: MemoryLearningTargetType
  summary: string
  evidence?: unknown[]
  sourceTurnIds?: string[]
  confidence?: number | null
}): Promise<MemoryLearningCandidate> {
  const { data } = await api.post('/api/memory/learning-candidates', body)
  return data
}

export async function approveMemoryLearningCandidate(id: string): Promise<MemoryLearningCandidate> {
  const { data } = await api.post(`/api/memory/learning-candidates/${encodeURIComponent(id)}/approve`)
  return data
}

export async function rejectMemoryLearningCandidate(id: string): Promise<MemoryLearningCandidate> {
  const { data } = await api.post(`/api/memory/learning-candidates/${encodeURIComponent(id)}/reject`)
  return data
}

export async function applyMemoryLearningCandidate(id: string, force = false): Promise<{ candidate: MemoryLearningCandidate; result: Record<string, unknown> }> {
  const { data } = await api.post(`/api/memory/learning-candidates/${encodeURIComponent(id)}/apply`, force ? { force: true } : {})
  return data
}

export async function getMemoryBackups(agentId: string): Promise<{ backups: MemoryBackup[] }> {
  const { data } = await api.get(`/api/memory/${encodeURIComponent(agentId)}/backups`)
  return data
}

export async function rollbackMemoryBackup(agentId: string, backupId: string): Promise<{ ok: boolean; agentId: string; backupId: string; rollbackBackupId: string; restoredBytes: number }> {
  const { data } = await api.post(`/api/memory/${encodeURIComponent(agentId)}/rollback`, { backupId })
  return data
}

// ─── Alerting ─────────────────────────────────────────────────────────────────

export interface AlertingConfig {
  telegram: { enabled: boolean; chatId: string; noResponseSec?: number }
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
