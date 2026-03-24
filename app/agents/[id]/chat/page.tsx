'use client'

import { useQuery } from '@tanstack/react-query'
import { getAgentSessions, getSessionMessages, type ChatSession, type ChatMessage } from '@/lib/api'
import { use, useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

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
  const marker = '```'
  const firstIdx = text.indexOf(marker)
  if (firstIdx === -1) return text
  const secondIdx = text.indexOf(marker, firstIdx + marker.length)
  if (secondIdx === -1) return text
  const after = text.slice(secondIdx + marker.length).trimStart()
  return after || text
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

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const text = isUser ? cleanUserText(msg.text) : msg.text
  if (!text) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
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
    const result: ChatMessage[] = []
    let capturing = false
    for (const m of messages) {
      if (m.role === 'user') {
        capturing = m.senderId === selectedSenderId
        if (capturing) result.push(m)
      } else {
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
      {filtered.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
      <div ref={bottomRef} />
    </div>
  )
}

// ---- Main page --------------------------------------------------------------

export default function AgentChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [selectedSenderId, setSelectedSenderId] = useState<string | null>(null)

  const { data: sessions = [] } = useQuery({
    queryKey: ['agent-sessions', id],
    queryFn: () => getAgentSessions(id),
    refetchInterval: 30000,
  })

  const sessionIds = sessions.map(s => s.sessionId)
  const { data: allMessages = [], isLoading } = useQuery({
    queryKey: ['all-messages', id, sessionIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        sessions.map(s => getSessionMessages(id, s.sessionId))
      )
      return results.flat().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    },
    enabled: sessions.length > 0,
    refetchInterval: 30000,
  })

  const senders = useMemo<SenderInfo[]>(() => {
    const map: Record<string, SenderInfo> = {}
    for (const msg of allMessages) {
      if (msg.role !== 'user') continue
      const sid = msg.senderId || parseSenderId(msg.text)
      if (!sid) continue
      const name = msg.senderName || parseSenderName(msg.text) || sid
      if (!map[sid]) map[sid] = { id: sid, name, lastMessageAt: msg.timestamp, messageCount: 0 }
      map[sid].messageCount++
      if (msg.timestamp > map[sid].lastMessageAt) map[sid].lastMessageAt = msg.timestamp
    }
    return Object.values(map).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  }, [allMessages])

  useEffect(() => {
    if (senders.length > 0 && !selectedSenderId) setSelectedSenderId(senders[0].id)
  }, [senders, selectedSenderId])

  const selectedSender = senders.find(s => s.id === selectedSenderId)

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href={`/agents/${id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Agent: {id}
        </Link>
        <h1 className="text-2xl font-bold">Chat Monitor</h1>
      </div>

      {!isLoading && (
        <AnalyticsCards sessions={sessions} messages={allMessages} agentId={id} />
      )}

      <div className="flex gap-3 h-[600px]">
        {/* Sender sidebar */}
        <div className="w-56 shrink-0 flex flex-col gap-1 overflow-y-auto border rounded-xl p-2 bg-white dark:bg-zinc-900">
          <p className="text-xs font-semibold text-zinc-500 px-2 py-1">
            Users ({senders.length})
          </p>
          {isLoading && <p className="text-sm text-zinc-400 px-2 py-4">กำลังโหลด...</p>}
          {!isLoading && senders.length === 0 && (
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
          {selectedSender && (
            <div className="border-b px-4 py-2.5 shrink-0">
              <p className="text-sm font-semibold">{selectedSender.name}</p>
              <p className="text-xs text-zinc-500">Telegram {selectedSender.id} · {selectedSender.messageCount} ข้อความ</p>
            </div>
          )}
          {selectedSenderId ? (
            <ChatView messages={allMessages} isLoading={isLoading} selectedSenderId={selectedSenderId} />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
              เลือก user เพื่อดูแชท
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
