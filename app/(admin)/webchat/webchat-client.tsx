'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

// strip gateway artifacts เช่น [[ reply_to_current]]
function cleanContent(text: string): string {
  return text.replace(/\[\[\s*reply_to_current\s*\]\]\s*/gi, '').trim()
}

interface OptimisticMessage {
  id: string
  username: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

export default function WebchatClient({ username, role }: Props) {
  const isAdmin = role === 'admin' || role === 'superadmin'
  const qc = useQueryClient()

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

  const [activeRoomId, setActiveRoomId] = useState<number | null>(null)
  const activeRoom = rooms.find(r => r.id === activeRoomId) ?? null

  // auto-select ห้องเดียว
  useEffect(() => {
    if (rooms.length === 1 && activeRoomId === null) setActiveRoomId(rooms[0].id)
  }, [rooms, activeRoomId])

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['webchat-history', activeRoomId, username],
    queryFn: () => getWebchatHistory(activeRoomId!, username),
    enabled: !!activeRoomId,
  })

  // optimistic messages (แสดงก่อน API ตอบกลับ)
  const [optimisticMsgs, setOptimisticMsgs] = useState<OptimisticMessage[]>([])
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // clear optimistic เมื่อ history update
  useEffect(() => {
    if (history.length > 0) setOptimisticMsgs([])
  }, [history])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, optimisticMsgs])

  async function handleSend() {
    if (!message.trim() || !activeRoomId || sending) return
    const text = message.trim()
    setMessage('')
    setSending(true)

    // แสดง user message ทันที
    const tempId = `opt-${Date.now()}`
    setOptimisticMsgs([{ id: tempId, username, role: 'user', content: text, pending: true }])

    try {
      await sendWebchatMessage(activeRoomId, username, text)
      await refetchHistory()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      toast.error(err?.response?.data?.error || err?.message || 'ส่งข้อความไม่สำเร็จ')
      setOptimisticMsgs([])
    } finally {
      setSending(false)
    }
  }

  // ─── Room management ─────────────────────────────────────────────────────
  const [addDialog, setAddDialog] = useState(false)
  const [editRoom, setEditRoom] = useState<WebchatRoom | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<WebchatRoom | null>(null)
  const [newAgentId, setNewAgentId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPolicy, setNewPolicy] = useState<'open' | 'allowlist'>('open')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editPolicy, setEditPolicy] = useState<'open' | 'allowlist'>('open')

  const createMutation = useMutation({
    mutationFn: () => createWebchatRoom(newAgentId, newDisplayName || newAgentId, newPolicy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webchat-rooms'] })
      toast.success('สร้างห้องสำเร็จ')
      setAddDialog(false)
      setNewAgentId(''); setNewDisplayName(''); setNewPolicy('open')
    },
    onError: (e: Error) => toast.error(e.message || 'สร้างห้องไม่สำเร็จ'),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateWebchatRoom(editRoom!.id, { display_name: editDisplayName, policy: editPolicy }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webchat-rooms'] })
      toast.success('บันทึกสำเร็จ')
      setEditRoom(null)
    },
    onError: () => toast.error('บันทึกไม่สำเร็จ'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteWebchatRoom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webchat-rooms'] })
      if (activeRoomId === deleteConfirm?.id) setActiveRoomId(null)
      setDeleteConfirm(null)
      toast.success('ลบห้องสำเร็จ')
    },
  })

  const updatePolicyMutation = useMutation({
    mutationFn: ({ id, policy }: { id: number; policy: string }) => updateWebchatRoom(id, { policy }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webchat-rooms'] }),
  })

  // allowlist
  const [addUserRoomId, setAddUserRoomId] = useState<number | null>(null)
  const [newAllowUsername, setNewAllowUsername] = useState('')

  const addUserMutation = useMutation({
    mutationFn: ({ roomId, u }: { roomId: number; u: string }) => addWebchatRoomUser(roomId, u),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webchat-rooms'] }); setNewAllowUsername(''); setAddUserRoomId(null) },
    onError: (e: Error) => toast.error(e.message),
  })

  const removeUserMutation = useMutation({
    mutationFn: ({ roomId, u }: { roomId: number; u: string }) => removeWebchatRoomUser(roomId, u),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webchat-rooms'] }),
  })

  // ─── Combined message list (history + optimistic) ────────────────────────
  const allMessages: (WebchatMessage | OptimisticMessage)[] = [
    ...history.map(m => ({ ...m, id: String(m.id) })),
    ...optimisticMsgs,
  ]

  // ─── render role=chat (minimal) ──────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">{activeRoom ? activeRoom.display_name : 'Webchat'}</h1>
          {rooms.length > 1 && (
            <Select value={activeRoomId?.toString() ?? ''} onValueChange={v => setActiveRoomId(Number(v))}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="เลือกห้อง" /></SelectTrigger>
              <SelectContent>{rooms.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.display_name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        {!activeRoom
          ? <p className="text-sm text-zinc-400">คุณยังไม่มีห้องแชทที่เข้าถึงได้</p>
          : <ChatArea allMessages={allMessages} message={message} sending={sending} username={username} onMessageChange={setMessage} onSend={handleSend} bottomRef={bottomRef} />
        }
      </div>
    )
  }

  // ─── render role=admin (2-column) ────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] gap-0 -m-6 overflow-hidden">

      {/* ── Left: room list ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-zinc-50 dark:bg-zinc-900">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">ห้องแชท</span>
          <Button size="sm" className="h-7 text-xs px-2" onClick={() => setAddDialog(true)}>+ เพิ่ม</Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {rooms.length === 0 && <p className="text-xs text-zinc-400 px-4 py-3">ยังไม่มีห้อง</p>}
          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors group flex items-start gap-2 ${
                activeRoomId === room.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{room.display_name}</p>
                <p className={`text-xs truncate ${activeRoomId === room.id ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-400'}`}>
                  {room.agent_id} · {room.policy}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                <button
                  className={`text-xs px-1.5 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 ${activeRoomId === room.id ? 'text-zinc-300' : 'text-zinc-400'}`}
                  onClick={() => { setEditRoom(room); setEditDisplayName(room.display_name); setEditPolicy(room.policy) }}
                  title="แก้ไข"
                >✎</button>
                <button
                  className={`text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900 ${activeRoomId === room.id ? 'text-zinc-300' : 'text-zinc-400'} hover:text-red-600`}
                  onClick={() => setDeleteConfirm(room)}
                  title="ลบ"
                >✕</button>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: chat or config ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
            <p className="text-sm">เลือกห้องทางซ้าย หรือกด + เพิ่ม เพื่อสร้างห้องใหม่</p>
          </div>
        ) : (
          <>
            {/* header */}
            <div className="px-5 py-3 border-b flex items-center gap-3 bg-white dark:bg-zinc-950">
              <div className="flex-1">
                <h2 className="font-semibold text-sm">{activeRoom.display_name}</h2>
                <p className="text-xs text-zinc-400">agent: {activeRoom.agent_id}</p>
              </div>
              <Badge variant="secondary" className="text-xs">{activeRoom.policy}</Badge>
              {/* policy toggle */}
              <Select
                value={activeRoom.policy}
                onValueChange={v => v && updatePolicyMutation.mutate({ id: activeRoom.id, policy: v })}
              >
                <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open — ทุกคน</SelectItem>
                  <SelectItem value="allowlist">allowlist — เฉพาะที่กำหนด</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* allowlist bar (ถ้า policy=allowlist) */}
            {activeRoom.policy === 'allowlist' && (
              <div className="px-5 py-2 border-b bg-zinc-50 dark:bg-zinc-900 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500 shrink-0">Users:</span>
                {activeRoom.allowed_users.map(u => (
                  <Badge key={u} variant="secondary" className="text-xs gap-1 pr-1">
                    {u}
                    <button className="ml-0.5 hover:text-red-500" onClick={() => removeUserMutation.mutate({ roomId: activeRoom.id, u })}>×</button>
                  </Badge>
                ))}
                {addUserRoomId === activeRoom.id ? (
                  <>
                    <Select value={newAllowUsername} onValueChange={v => v && setNewAllowUsername(v)}>
                      <SelectTrigger className="h-6 w-36 text-xs"><SelectValue placeholder="เลือก user" /></SelectTrigger>
                      <SelectContent>
                        {chatUsers.filter(u => !activeRoom.allowed_users.includes(u.username)).map(u => (
                          <SelectItem key={u.username} value={u.username}>{u.display_name || u.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-6 text-xs px-2"
                      disabled={!newAllowUsername || addUserMutation.isPending}
                      onClick={() => addUserMutation.mutate({ roomId: activeRoom.id, u: newAllowUsername })}
                    >Add</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                      onClick={() => { setAddUserRoomId(null); setNewAllowUsername('') }}
                    >ยกเลิก</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                    onClick={() => setAddUserRoomId(activeRoom.id)}
                  >+ User</Button>
                )}
              </div>
            )}

            {/* chat area */}
            <ChatArea
              allMessages={allMessages}
              message={message}
              sending={sending}
              username={username}
              onMessageChange={setMessage}
              onSend={handleSend}
              bottomRef={bottomRef}
            />
          </>
        )}
      </div>

      {/* ── Add Room Dialog ── */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>เพิ่มห้องแชทใหม่</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Agent</label>
              <Select value={newAgentId} onValueChange={v => v && setNewAgentId(v)}>
                <SelectTrigger><SelectValue placeholder="เลือก Agent" /></SelectTrigger>
                <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ชื่อห้อง</label>
              <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="เช่น ฝ่ายขาย, คลังสินค้า" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Policy</label>
              <Select value={newPolicy} onValueChange={v => setNewPolicy(v as 'open' | 'allowlist')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open — ทุกคนเข้าได้</SelectItem>
                  <SelectItem value="allowlist">allowlist — เฉพาะที่กำหนด</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>ยกเลิก</Button>
            <Button disabled={!newAgentId || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'กำลังสร้าง...' : 'สร้างห้อง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Room Dialog ── */}
      <Dialog open={!!editRoom} onOpenChange={open => { if (!open) setEditRoom(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>แก้ไขห้อง</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">ชื่อห้อง</label>
              <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Policy</label>
              <Select value={editPolicy} onValueChange={v => setEditPolicy(v as 'open' | 'allowlist')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open — ทุกคนเข้าได้</SelectItem>
                  <SelectItem value="allowlist">allowlist — เฉพาะที่กำหนด</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoom(null)}>ยกเลิก</Button>
            <Button disabled={!editDisplayName.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
              {updateMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>ลบห้อง &quot;{deleteConfirm?.display_name}&quot;?</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-500 py-2">ประวัติแชทในห้องนี้จะถูกลบทั้งหมด ไม่สามารถกู้คืนได้</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>ยกเลิก</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}>
              {deleteMutation.isPending ? 'กำลังลบ...' : 'ลบห้อง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Chat Area ────────────────────────────────────────────────────────────────
interface ChatAreaProps {
  allMessages: (WebchatMessage | OptimisticMessage)[]
  message: string
  sending: boolean
  username: string
  onMessageChange: (v: string) => void
  onSend: () => void
  bottomRef: React.RefObject<HTMLDivElement | null>
}

function ChatArea({ allMessages, message, sending, username, onMessageChange, onSend, bottomRef }: ChatAreaProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {allMessages.length === 0 && (
          <p className="text-sm text-zinc-400 text-center mt-12">เริ่มบทสนทนาได้เลย</p>
        )}
        {allMessages.map(m => {
          const isPending = 'pending' in m && m.pending
          const content = cleanContent(m.content)
          return (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? `bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 ${isPending ? 'opacity-60' : ''}`
                  : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
              }`}>
                {m.role === 'user' && m.username !== username && (
                  <p className="text-xs text-zinc-300 dark:text-zinc-500 mb-1">{m.username}</p>
                )}
                {content}
                {isPending && <span className="ml-2 text-xs opacity-50">กำลังส่ง...</span>}
              </div>
            </div>
          )
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-zinc-400 flex gap-1 items-center">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-75">●</span>
              <span className="animate-pulse delay-150">●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t px-4 py-3 flex gap-2 bg-white dark:bg-zinc-950">
        <Input
          value={message}
          onChange={e => onMessageChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder="พิมพ์ข้อความ แล้วกด Enter..."
          disabled={sending}
          className="flex-1"
          autoFocus
        />
        <Button onClick={onSend} disabled={!message.trim() || sending} className="px-5">
          ส่ง
        </Button>
      </div>
    </div>
  )
}
