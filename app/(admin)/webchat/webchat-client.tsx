'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  getWebchatRooms, createWebchatRoom, updateWebchatRoom, deleteWebchatRoom,
  addWebchatRoomUser, removeWebchatRoomUser,
  getWebchatHistory, sendWebchatMessage,
  getChatUsers, getAgents,
  type WebchatRoom, type WebchatMessage,
} from '@/lib/api'

interface Props {
  username: string
  role: string
}

export default function WebchatClient({ username, role }: Props) {
  const isAdmin = role === 'admin' || role === 'superadmin'
  const qc = useQueryClient()

  // ─── rooms ───────────────────────────────────────────────────────────────
  const { data: rooms = [] } = useQuery({
    queryKey: ['webchat-rooms', username],
    queryFn: () => isAdmin ? getWebchatRooms() : getWebchatRooms(username),
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
    enabled: isAdmin,
  })

  const { data: chatUsers = [] } = useQuery({
    queryKey: ['chat-users'],
    queryFn: getChatUsers,
    enabled: isAdmin,
  })

  // ─── selected room + chat state ──────────────────────────────────────────
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null)
  const activeRoom = rooms.find(r => r.id === activeRoomId) ?? null

  // auto-select ห้องเดียว (สำหรับ role=chat)
  useEffect(() => {
    if (!isAdmin && rooms.length === 1 && activeRoomId === null) {
      setActiveRoomId(rooms[0].id)
    }
  }, [rooms, isAdmin, activeRoomId])

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['webchat-history', activeRoomId, username],
    queryFn: () => getWebchatHistory(activeRoomId!, username),
    enabled: !!activeRoomId,
  })

  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  async function handleSend() {
    if (!message.trim() || !activeRoomId || sending) return
    const text = message.trim()
    setMessage('')
    setSending(true)
    try {
      await sendWebchatMessage(activeRoomId, username, text)
      await refetchHistory()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      toast.error(err?.response?.data?.error || err?.message || 'ส่งข้อความไม่สำเร็จ')
    } finally {
      setSending(false)
    }
  }

  // ─── add room dialog ──────────────────────────────────────────────────────
  const [addDialog, setAddDialog] = useState(false)
  const [newAgentId, setNewAgentId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPolicy, setNewPolicy] = useState<'open' | 'allowlist'>('open')

  const createMutation = useMutation({
    mutationFn: () => createWebchatRoom(newAgentId, newDisplayName || newAgentId, newPolicy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webchat-rooms'] })
      toast.success('สร้างห้องสำเร็จ')
      setAddDialog(false)
      setNewAgentId('')
      setNewDisplayName('')
      setNewPolicy('open')
    },
    onError: (e: Error) => toast.error(e.message || 'สร้างห้องไม่สำเร็จ'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteWebchatRoom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webchat-rooms'] })
      if (activeRoomId) setActiveRoomId(null)
      toast.success('ลบห้องสำเร็จ')
    },
  })

  const updatePolicyMutation = useMutation({
    mutationFn: ({ id, policy }: { id: number; policy: string }) => updateWebchatRoom(id, { policy }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webchat-rooms'] }),
  })

  // ─── allowlist management ─────────────────────────────────────────────────
  const [addUserRoomId, setAddUserRoomId] = useState<number | null>(null)
  const [newAllowUsername, setNewAllowUsername] = useState('')

  const addUserMutation = useMutation({
    mutationFn: ({ roomId, username: u }: { roomId: number; username: string }) =>
      addWebchatRoomUser(roomId, u),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webchat-rooms'] })
      toast.success('เพิ่ม user สำเร็จ')
      setNewAllowUsername('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const removeUserMutation = useMutation({
    mutationFn: ({ roomId, username: u }: { roomId: number; username: string }) =>
      removeWebchatRoomUser(roomId, u),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webchat-rooms'] }),
  })

  // ─── render ───────────────────────────────────────────────────────────────
  if (!isAdmin) {
    // role=chat: แสดงแค่ chat UI
    return (
      <div className="flex flex-col h-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Webchat</h1>
          {rooms.length > 1 && (
            <Select value={activeRoomId?.toString() ?? ''} onValueChange={v => setActiveRoomId(Number(v))}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="เลือกห้อง" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map(r => (
                  <SelectItem key={r.id} value={r.id.toString()}>{r.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {!activeRoom ? (
          <p className="text-sm text-zinc-400">คุณยังไม่มีห้องแชทที่เข้าถึงได้</p>
        ) : (
          <ChatPanel
            history={history}
            message={message}
            sending={sending}
            username={username}
            onMessageChange={setMessage}
            onSend={handleSend}
            bottomRef={bottomRef}
          />
        )}
      </div>
    )
  }

  // role=admin/superadmin: Tabs (Config | Chat)
  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webchat</h1>
          <p className="text-sm text-zinc-500 mt-1">จัดการห้องแชทและคุยกับ Agent</p>
        </div>
        <Button onClick={() => setAddDialog(true)}>+ เพิ่มห้อง</Button>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="chat" disabled={!activeRoom}>Chat{activeRoom ? ` — ${activeRoom.display_name}` : ''}</TabsTrigger>
        </TabsList>

        {/* ── Config Tab ── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          {rooms.length === 0 && <p className="text-sm text-zinc-400">ยังไม่มีห้อง — กด "เพิ่มห้อง" เพื่อเริ่ม</p>}
          {rooms.map(room => (
            <Card key={room.id}>
              <CardHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-base">{room.display_name}</CardTitle>
                  <span className="text-xs text-zinc-400 font-mono">agent: {room.agent_id}</span>
                  <Badge variant="secondary" className="text-xs">{room.policy}</Badge>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs"
                      onClick={() => { setActiveRoomId(room.id) }}
                    >
                      เปิดแชท
                    </Button>
                    <Button variant="destructive" size="sm" className="text-xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(room.id)}
                    >
                      ลบ
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Policy */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-500 w-20">Policy:</span>
                  <Select
                    value={room.policy}
                    onValueChange={v => v && updatePolicyMutation.mutate({ id: room.id, policy: v })}
                  >
                    <SelectTrigger className="w-36 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">open — ทุกคน</SelectItem>
                      <SelectItem value="allowlist">allowlist — เฉพาะที่กำหนด</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Allowlist */}
                {room.policy === 'allowlist' && (
                  <div className="space-y-2">
                    <span className="text-sm text-zinc-500">Users ที่เข้าได้:</span>
                    <div className="flex flex-wrap gap-2">
                      {room.allowed_users.map(u => (
                        <Badge key={u} variant="secondary" className="gap-1 pr-1">
                          {u}
                          <button
                            className="ml-1 text-zinc-400 hover:text-red-500"
                            onClick={() => removeUserMutation.mutate({ roomId: room.id, username: u })}
                          >×</button>
                        </Badge>
                      ))}
                      {room.allowed_users.length === 0 && <span className="text-xs text-zinc-400">ยังไม่มี user</span>}
                    </div>
                    <div className="flex gap-2 mt-1">
                      {addUserRoomId === room.id ? (
                        <>
                          <Select value={newAllowUsername} onValueChange={v => v && setNewAllowUsername(v)}>
                            <SelectTrigger className="w-48 h-8 text-sm">
                              <SelectValue placeholder="เลือก user" />
                            </SelectTrigger>
                            <SelectContent>
                              {chatUsers
                                .filter(u => !room.allowed_users.includes(u.username))
                                .map(u => (
                                  <SelectItem key={u.username} value={u.username}>
                                    {u.display_name || u.username}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8 text-xs"
                            disabled={!newAllowUsername || addUserMutation.isPending}
                            onClick={() => {
                              addUserMutation.mutate({ roomId: room.id, username: newAllowUsername })
                              setAddUserRoomId(null)
                            }}
                          >Add</Button>
                          <Button variant="ghost" size="sm" className="h-8 text-xs"
                            onClick={() => { setAddUserRoomId(null); setNewAllowUsername('') }}
                          >ยกเลิก</Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8 text-xs"
                          onClick={() => { setAddUserRoomId(room.id); setNewAllowUsername('') }}
                        >+ เพิ่ม User</Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Chat Tab ── */}
        <TabsContent value="chat" className="mt-4">
          {activeRoom ? (
            <div className="max-w-2xl">
              <ChatPanel
                history={history}
                message={message}
                sending={sending}
                username={username}
                onMessageChange={setMessage}
                onSend={handleSend}
                bottomRef={bottomRef}
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-400">เลือกห้องจาก Config แล้วกด &quot;เปิดแชท&quot;</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Room Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มห้องแชทใหม่</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Agent</label>
              <Select value={newAgentId} onValueChange={v => v && setNewAgentId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือก Agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ชื่อห้อง (แสดงผล)</label>
              <Input
                value={newDisplayName}
                onChange={e => setNewDisplayName(e.target.value)}
                placeholder="เช่น ฝ่ายขาย, คลังสินค้า"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Policy</label>
              <Select value={newPolicy} onValueChange={v => setNewPolicy(v as 'open' | 'allowlist')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open — ทุกคนเข้าได้</SelectItem>
                  <SelectItem value="allowlist">allowlist — เฉพาะที่กำหนด</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>ยกเลิก</Button>
            <Button
              disabled={!newAgentId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'กำลังสร้าง...' : 'สร้างห้อง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Chat Panel Component ─────────────────────────────────────────────────────
interface ChatPanelProps {
  history: WebchatMessage[]
  message: string
  sending: boolean
  username: string
  onMessageChange: (v: string) => void
  onSend: () => void
  bottomRef: React.RefObject<HTMLDivElement | null>
}

function ChatPanel({ history, message, sending, username, onMessageChange, onSend, bottomRef }: ChatPanelProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-220px)] border rounded-lg overflow-hidden bg-white dark:bg-zinc-950">
      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 && (
          <p className="text-sm text-zinc-400 text-center mt-8">เริ่มบทสนทนาได้เลย</p>
        )}
        {history.map(m => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
              }`}
            >
              {m.role === 'assistant' && (
                <p className="text-xs text-zinc-400 mb-1">Assistant</p>
              )}
              {m.role === 'user' && m.username !== username && (
                <p className="text-xs text-zinc-300 mb-1">{m.username}</p>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-2 text-sm text-zinc-400">
              กำลังตอบ...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {/* input */}
      <div className="border-t p-3 flex gap-2">
        <Input
          value={message}
          onChange={e => onMessageChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder="พิมพ์ข้อความ..."
          disabled={sending}
          className="flex-1"
        />
        <Button onClick={onSend} disabled={!message.trim() || sending}>
          {sending ? '...' : 'ส่ง'}
        </Button>
      </div>
    </div>
  )
}
