'use client'

import { useQuery } from '@tanstack/react-query'
import { getAgents, getAgentSessions, getSessionMessages, type ChatSession, type ChatMessage } from '@/lib/api'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ---- helpers ----------------------------------------------------------------

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'เมื่อกี้'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function cleanUserText(text: string): string {
  // strip metadata blocks — take text after last ``` block
  const parts = text.split('```')
  if (parts.length >= 3) {
    // last part after closing ``` of last block
    const after = parts[parts.length - 1].trimStart()
    if (after) return after
  }
  return text
}

function parseSenderId(text: string): string | null {
  const m = text.match(/"sender_id"\s*:\s*"(\d+)"/)
  return m ? m[1] : null
}

function parseSenderName(text: string): string | null {
  const m = text.match(/"name"\s*:\s*"([^"]+)"/)
  return m ? m[1] : null
}

// ---- Types ------------------------------------------------------------------

interface SenderInfo {
  id: string
  name: string
  lastMessageAt: string
  messageCount: number
}

// ---- Analytics cards --------------------------------------------------------

function AnalyticsCards({ sessions, messages, agentId }: { sessions: ChatSession[], messages: ChatMessage[], agentId: string }) {
  const totalTokens = sessions.reduce((sum, s) => sum + (s.inputTokens || 0) + (s.outputTokens || 0), 0)
  const userMessages = messages.filter(m => m.role === 'user')
  const senderIds = new Set(userMessages.map(m => m.senderId).filter(Boolean))

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-zinc-500 font-medium">ผู้ใช้งาน</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-2xl font-bold">{senderIds.size}</p>
          <p className="text-xs text-zinc-400">agent: {agentId}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-zinc-500 font-medium">ข้อความทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-2xl font-bold">{userMessages.length}</p>
          <p className="text-xs text-zinc-400">จาก user</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-zinc-500 font-medium">Tokens ที่ใช้</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-2xl font-bold">{formatTokens(totalTokens)}</p>
          <p className="text-xs text-zinc-400">input + output</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-zinc-500 font-medium">Sessions</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-2xl font-bold">{sessions.length}</p>
          <p className="text-xs text-zinc-400">ทั้งหมด</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Sender list item -------------------------------------------------------

function SenderItem({ sender, selected, onClick }: { sender: SenderInfo, selected: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
        selected
          ? 'bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700'
          : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800'
      }`}
    >
      <p className="text-sm font-medium truncate">{sender.name}</p>
      <p className="text-xs text-zinc-500 font-mono">{sender.id}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-zinc-400">{formatRelativeTime(new Date(sender.lastMessageAt).getTime())}</span>
        <Badge variant="secondary" className="text-xs px-1 py-0 h-4">{sender.messageCount} ข้อความ</Badge>
      </div>
    </button>
  )
}

// ---- Chat bubble ------------------------------------------------------------

function ChatBubble({ msg, showSender }: { msg: ChatMessage, showSender?: boolean }) {
  const isUser = msg.role === 'user'
  const text = isUser ? cleanUserText(msg.text) : msg.text
  if (!text) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
        {showSender && isUser && msg.senderName && (
          <p className="text-xs text-zinc-400 px-1">{msg.senderName}</p>
        )}
        <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100 rounded-br-sm'
            : 'bg-blue-500 text-white rounded-bl-sm'
        }`}>
          {text}
        </div>
        <p className="text-[10px] text-zinc-400 px-1">{formatTimestamp(msg.timestamp)}</p>
      </div>
    </div>
  )
}

// ---- Chat view --------------------------------------------------------------

function ChatView({ messages, isLoading, selectedSenderId }: {
  messages: ChatMessage[]
  isLoading: boolean
  selectedSenderId: string | null
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!selectedSenderId) return messages
    // Thread assistant replies: include assistant messages that immediately follow
    // a user message from this sender (until the next user message from anyone)
    const result: ChatMessage[] = []
    let capturing = false
    for (const m of messages) {
      if (m.role === 'user') {
        capturing = m.senderId === selectedSenderId
        if (capturing) result.push(m)
      } else {
        // assistant message
        if (capturing) result.push(m)
      }
    }
    return result
  }, [messages, selectedSenderId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filtered])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
      {isLoading && <p className="text-sm text-zinc-400 text-center py-8">กำลังโหลดข้อความ...</p>}
      {!isLoading && filtered.length === 0 && <p className="text-sm text-zinc-400 text-center py-8">ไม่มีข้อความ</p>}
      {filtered.map(msg => <ChatBubble key={msg.id} msg={msg} showSender={!selectedSenderId} />)}
      <div ref={bottomRef} />
    </div>
  )
}

// ---- Main page --------------------------------------------------------------

export default function ChatsPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedSenderId, setSelectedSenderId] = useState<string | null>(null)

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => import('@/lib/api').then(m => m.getAgents()),
  })

  const { data: sessions = [] } = useQuery({
    queryKey: ['agent-sessions', selectedAgentId],
    queryFn: () => getAgentSessions(selectedAgentId),
    enabled: !!selectedAgentId,
    refetchInterval: 30000,
  })

  // โหลด messages จาก 20 sessions ล่าสุดเท่านั้น เพื่อป้องกัน N+1 requests
  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20),
    [sessions]
  )
  const { data: allMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['all-messages', selectedAgentId, recentSessions.length],
    queryFn: async () => {
      const results = await Promise.all(
        recentSessions.map(s => getSessionMessages(selectedAgentId, s.sessionId))
      )
      return results.flat().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    },
    enabled: !!selectedAgentId && recentSessions.length > 0,
    refetchInterval: 30000,
  })

  // สร้าง sender list จาก messages
  const senders = useMemo<SenderInfo[]>(() => {
    const map: Record<string, SenderInfo> = {}
    for (const msg of allMessages) {
      if (msg.role !== 'user') continue
      const id = msg.senderId || parseSenderId(msg.text)
      if (!id) continue
      const name = msg.senderName || parseSenderName(msg.text) || id
      if (!map[id]) {
        map[id] = { id, name, lastMessageAt: msg.timestamp, messageCount: 0 }
      }
      map[id].messageCount++
      if (msg.timestamp > map[id].lastMessageAt) map[id].lastMessageAt = msg.timestamp
    }
    return Object.values(map).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  }, [allMessages])

  // auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) setSelectedAgentId(agents[0].id)
  }, [agents, selectedAgentId])

  // reset sender เมื่อเปลี่ยน agent
  useEffect(() => { setSelectedSenderId(null) }, [selectedAgentId])

  // auto-select first sender
  useEffect(() => {
    if (senders.length > 0 && !selectedSenderId) setSelectedSenderId(senders[0].id)
  }, [senders, selectedSenderId])

  const selectedSender = senders.find(s => s.id === selectedSenderId)

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chat History</h1>
          <p className="text-sm text-zinc-500 mt-1">ดูประวัติแชทแยกตาม user และ agent (Telegram, LINE, Webchat)</p>
        </div>

        {/* Agent selector */}
        <div className="flex gap-1.5">
          {agents.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedAgentId(a.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                selectedAgentId === a.id
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {a.id}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics */}
      {selectedAgentId && !messagesLoading && (
        <AnalyticsCards sessions={sessions} messages={allMessages} agentId={selectedAgentId} />
      )}

      {/* Split layout */}
      <div className="flex gap-3 h-[calc(100vh-280px)] min-h-[400px]">
        {/* Sender sidebar */}
        <div className="w-56 shrink-0 flex flex-col gap-1 overflow-y-auto border rounded-xl p-2 bg-white dark:bg-zinc-900">
          <p className="text-xs font-semibold text-zinc-500 px-2 py-1">
            Users ({senders.length})
          </p>
          {messagesLoading && <p className="text-sm text-zinc-400 px-2 py-4">กำลังโหลด...</p>}
          {!messagesLoading && senders.length === 0 && selectedAgentId && (
            <p className="text-sm text-zinc-400 px-2 py-4">ยังไม่มีข้อความ</p>
          )}
          {senders.map(s => (
            <SenderItem
              key={s.id}
              sender={s}
              selected={selectedSenderId === s.id}
              onClick={() => setSelectedSenderId(s.id)}
            />
          ))}
        </div>

        {/* Chat panel */}
        <div className="flex-1 border rounded-xl overflow-hidden bg-white dark:bg-zinc-900 flex flex-col">
          {/* Header */}
          {selectedSender && (
            <div className="border-b px-4 py-2.5 shrink-0">
              <p className="text-sm font-semibold">{selectedSender.name}</p>
              <p className="text-xs text-zinc-500 font-mono">{selectedSender.id} · {selectedSender.messageCount} ข้อความ</p>
            </div>
          )}

          {selectedSenderId ? (
            <ChatView
              messages={allMessages}
              isLoading={messagesLoading}
              selectedSenderId={selectedSenderId}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
              {selectedAgentId ? 'เลือก user เพื่อดูแชท' : 'เลือก agent ก่อน'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
