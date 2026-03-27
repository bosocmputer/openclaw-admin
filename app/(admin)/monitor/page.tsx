'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, type MonitorAgent, type MonitorSession, type MonitorEvent } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TH_LOCALE = 'th-TH'
const TH_TZ = 'Asia/Bangkok'

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff} วินาทีที่แล้ว`
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
  return new Date(iso).toLocaleDateString(TH_LOCALE, { timeZone: TH_TZ, day: 'numeric', month: 'short' })
}

/** แปลง ISO timestamp เป็นเวลาไทย HH:MM:SS */
function isoToThaiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(TH_LOCALE, { timeZone: TH_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function parseTs(ts: string): number {
  const parts = ts.split(':')
  if (parts.length < 3) return 0
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
}

function deltaLabel(prev: string, next: string): string {
  const diff = Math.abs(parseTs(next) - parseTs(prev))
  // ถ้าข้ามวัน (เช่น 23:59 → 00:01) diff จะใหญ่มาก ให้ใช้ modulo 86400
  const real = diff > 43200 ? 86400 - diff : diff
  if (real < 1) return `${(real * 1000).toFixed(0)}ms`
  if (real < 60) return `${real.toFixed(1)}s`
  return `${Math.floor(real / 60)}m ${Math.round(real % 60)}s`
}

// ─── State Config — ใช้ emoji แทน 8-bit ──────────────────────────────────────
// state     = สถานะปัจจุบันของ session
// icon      = emoji ที่แสดงแทน AI character
// label     = ชื่อสถานะ (ไทย)
// sublabel  = คำอธิบายสั้น
// color     = accent color
// bg        = พื้นหลัง card
// border    = ขอบ card
// animClass = CSS animation class
const STATE_CONFIG = {
  idle: {
    icon: '😴',
    label: 'รอข้อความ',
    sublabel: 'ไม่มี activity',
    color: '#94a3b8',
    bg: 'hsl(220 14% 10%)',
    border: 'hsl(220 14% 16%)',
    animClass: '',
  },
  thinking: {
    icon: '🤔',
    label: 'กำลังคิด',
    sublabel: 'AI ประมวลผลคำถาม',
    color: '#fbbf24',
    bg: 'hsl(42 30% 8%)',
    border: 'hsl(42 60% 22%)',
    animClass: 'anim-think',
  },
  tool_call: {
    icon: '🔍',
    label: 'ค้นข้อมูล',
    sublabel: 'เรียก MCP / ERP',
    color: '#a78bfa',
    bg: 'hsl(262 30% 8%)',
    border: 'hsl(262 50% 22%)',
    animClass: 'anim-search',
  },
  replied: {
    icon: '💬',
    label: 'ตอบแล้ว',
    sublabel: 'ส่งคำตอบให้ user',
    color: '#34d399',
    bg: 'hsl(158 30% 7%)',
    border: 'hsl(158 50% 18%)',
    animClass: '',
  },
  error: {
    icon: '😵',
    label: 'เกิดข้อผิดพลาด',
    sublabel: 'ดู logs เพิ่มเติม',
    color: '#f87171',
    bg: 'hsl(0 30% 8%)',
    border: 'hsl(0 60% 22%)',
    animClass: 'anim-error',
  },
} as const

type StateKey = keyof typeof STATE_CONFIG

function getCfg(state: string) {
  return STATE_CONFIG[(state as StateKey)] ?? STATE_CONFIG.idle
}

// ─── Event helpers ────────────────────────────────────────────────────────────
function eventEmoji(type: string): string {
  if (type === 'message')  return '📩'
  if (type === 'thinking') return '💭'
  if (type === 'tool')     return '🔧'
  if (type === 'reply')    return '✅'
  if (type === 'error')    return '🚨'
  return '·'
}

function eventColor(type: string): string {
  if (type === 'message')  return '#94a3b8'
  if (type === 'thinking') return '#64748b'
  if (type === 'tool')     return '#a78bfa'
  if (type === 'reply')    return '#34d399'
  if (type === 'error')    return '#f87171'
  return '#475569'
}

// ─── Flat Session ─────────────────────────────────────────────────────────────
interface FlatSession extends MonitorSession {
  agentId: string
  channel: 'webchat' | 'telegram'
}

function sortOrder(state: string): number {
  if (state === 'thinking' || state === 'tool_call') return 0
  if (state === 'replied') return 1
  if (state === 'error') return 2
  return 3
}

function flattenSessions(agents: MonitorAgent[]): FlatSession[] {
  const result: FlatSession[] = []
  for (const agent of agents) {
    for (const s of agent.channels.webchat ?? []) result.push({ ...s, agentId: agent.id, channel: 'webchat' })
    for (const s of agent.channels.telegram ?? []) result.push({ ...s, agentId: agent.id, channel: 'telegram' })
  }
  result.sort((a, b) => {
    const d = sortOrder(a.state) - sortOrder(b.state)
    if (d !== 0) return d
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return tb - ta
  })
  return result
}

// ─── AI Character Widget ──────────────────────────────────────────────────────
// วงกลม emoji ตัวใหญ่ + ชื่อสถานะ
function AICharacter({ state, elapsed }: { state: string; elapsed: number }) {
  const cfg = getCfg(state)
  return (
    <div className="flex flex-col items-center justify-center gap-1" style={{ minWidth: 72 }}>
      <div
        className={`text-4xl leading-none select-none ${cfg.animClass}`}
        style={{ filter: state === 'idle' ? 'grayscale(0.6)' : 'none' }}
        title={cfg.sublabel}
      >
        {cfg.icon}
      </div>
      <span
        className="text-xs font-semibold text-center leading-tight"
        style={{ color: cfg.color, maxWidth: 72 }}
      >
        {cfg.label}
      </span>
      {(state === 'thinking' || state === 'tool_call') && (
        <span className="text-xs" style={{ color: '#64748b' }}>{elapsed}s</span>
      )}
    </div>
  )
}

// ─── Session Row (compact, clickable) ─────────────────────────────────────────
function SessionRow({ session, onClick, isSelected }: {
  session: FlatSession
  onClick: () => void
  isSelected: boolean
}) {
  const cfg = getCfg(session.state)
  const isIdle = session.state === 'idle'
  const channelIcon = session.channel === 'telegram' ? '✈️' : '🌐'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border transition-all duration-200 hover:brightness-110"
      style={{
        background: cfg.bg,
        borderColor: isSelected ? cfg.color : cfg.border,
        opacity: isIdle && !isSelected ? 0.5 : 1,
        padding: '14px 16px',
        boxShadow: isSelected ? `0 0 0 1px ${cfg.color}40` : 'none',
      }}
    >
      <div className="flex items-center gap-4">
        {/* AI Character */}
        <AICharacter state={session.state} elapsed={session.elapsed} />

        {/* Info block */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Agent + channel + user */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: '#e2e8f0' }}>
              {session.agentId}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1e293b', color: '#64748b' }}>
              {channelIcon} {session.channel}
            </span>
            <span className="text-xs" style={{ color: '#475569' }}>·</span>
            <span className="text-sm truncate" style={{ color: '#94a3b8', maxWidth: 160 }}>
              {session.user}
            </span>
          </div>

          {/* Last user message */}
          {session.lastUserText ? (
            <p className="text-sm truncate" style={{ color: '#64748b' }}>
              📩 {session.lastUserText}
            </p>
          ) : (
            <p className="text-xs" style={{ color: '#334155' }}>ยังไม่มีข้อความ</p>
          )}

          {/* Bottom row: time + cost */}
          <div className="flex items-center gap-3 text-xs" style={{ color: '#475569' }}>
            {session.lastMessageAt && (
              <span title={isoToThaiTime(session.lastMessageAt)}>
                {relativeTime(session.lastMessageAt)} · {isoToThaiTime(session.lastMessageAt)} น.
              </span>
            )}
            {session.cost > 0 && (
              <span style={{ color: '#334155' }}>฿{(session.cost * 35).toFixed(3)}</span>
            )}
          </div>
        </div>

        {/* Right: event count + chevron */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {session.events.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1e293b', color: '#475569' }}>
              {session.events.length} events
            </span>
          )}
          <span style={{ color: isSelected ? cfg.color : '#334155', fontSize: 18, lineHeight: 1 }}>
            {isSelected ? '▾' : '▸'}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── Timeline Panel ───────────────────────────────────────────────────────────
function TimelinePanel({ events }: { events: MonitorEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-sm" style={{ color: '#334155' }}>
        ยังไม่มี events
      </div>
    )
  }

  return (
    <div className="space-y-0 font-mono" style={{ fontSize: 13 }}>
      {events.map((e, i) => {
        const prev = events[i - 1]
        const delta = prev ? deltaLabel(prev.ts, e.ts) : null
        const tsShort = e.ts.length >= 8 ? e.ts.slice(0, 8) : e.ts
        return (
          <div key={i}>
            {delta && (
              <div className="text-center text-xs py-0.5" style={{ color: '#334155' }}>
                ↕ {delta}
              </div>
            )}
            <div className="flex gap-3 items-start py-1.5 rounded-lg px-2 hover:bg-white/5 transition-colors">
              <span className="shrink-0 text-xs pt-0.5" style={{ color: '#475569', minWidth: 64 }}>{tsShort}</span>
              <span className="shrink-0 text-base leading-none" style={{ minWidth: 22 }}>{eventEmoji(e.type)}</span>
              <span
                className="text-sm leading-relaxed"
                style={{
                  color: eventColor(e.type),
                  fontStyle: e.type === 'thinking' ? 'italic' : undefined,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  flex: 1,
                  fontFamily: 'inherit',
                }}
              >
                {e.text}
              </span>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

// ─── Timeline Drawer ──────────────────────────────────────────────────────────
function TimelineDrawer({ session, onClose }: { session: FlatSession; onClose: () => void }) {
  const cfg = getCfg(session.state)
  return (
    <div
      className="rounded-b-xl border-x border-b overflow-hidden"
      style={{ borderColor: cfg.border, background: 'hsl(220 20% 6%)' }}
    >
      {/* Drawer header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: cfg.border, background: 'hsl(220 20% 8%)' }}
      >
        <div className="flex items-center gap-2 text-sm">
          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
          <span className="font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
          <span style={{ color: '#334155' }}>·</span>
          <span className="text-xs" style={{ color: '#475569' }}>{session.agentId} › {session.channel} | {session.user}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1 rounded-lg border transition-colors hover:bg-white/5"
          style={{ borderColor: '#1e293b', color: '#475569' }}
        >
          ✕ ปิด
        </button>
      </div>

      {/* Timeline scroll area */}
      <div className="px-4 py-3" style={{ maxHeight: 400, overflowY: 'auto' }}>
        <TimelinePanel events={session.events} />
      </div>

      {/* Last reply */}
      {session.lastReplyText && (
        <div
          className="mx-4 mb-4 rounded-xl p-3 text-sm"
          style={{ background: 'hsl(158 30% 5%)', borderLeft: `3px solid ${cfg.color}`, color: '#94a3b8', lineHeight: 1.6 }}
        >
          <div className="text-xs mb-1" style={{ color: '#334155' }}>💬 คำตอบล่าสุด</div>
          {session.lastReplyText.slice(0, 400)}{session.lastReplyText.length > 400 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

// ─── Info Dialog ──────────────────────────────────────────────────────────────
function InfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Monitor — คู่มือการใช้งาน</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-2">สถานะ AI</p>
            <div className="space-y-2">
              {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xl">{cfg.icon}</span>
                  <div>
                    <span className="font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="text-zinc-500 ml-2 text-xs">{cfg.sublabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Event Icons</p>
            <div className="space-y-1 text-xs text-zinc-500">
              <div className="flex gap-3"><span>📩</span><span>User ส่ง message เข้ามา</span></div>
              <div className="flex gap-3"><span>💭</span><span>AI กำลัง thinking (extended)</span></div>
              <div className="flex gap-3"><span>🔧</span><span>Tool call — เรียก MCP / ERP</span></div>
              <div className="flex gap-3"><span>✅</span><span>ตอบกลับสำเร็จ</span></div>
              <div className="flex gap-3"><span>🚨</span><span>Error — ดู logs เพิ่มเติม</span></div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">หลาย user ในห้องเดียวกัน</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              แต่ละ user มี session แยกกัน — ถ้า 2 user ถามพร้อมกันจะเห็น 2 แถวแยก
              แต่ละแถวแสดงสถานะ AI ของ user นั้นโดยเฉพาะ ไม่ปะปนกัน
            </p>
          </div>
          <p className="text-xs text-zinc-400">* อัปเดตทุก 3 วินาที · กด session row เพื่อดู timeline</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const [paused, setPaused] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['monitor'],
    queryFn: getMonitorEvents,
    refetchInterval: paused ? false : 3000,
  })

  const stats = data?.stats
  const agents = data?.agents ?? []
  const sessions = flattenSessions(agents)

  const selectedSession = selectedKey
    ? sessions.find(s => `${s.agentId}-${s.channel}-${s.sessionKey}` === selectedKey) ?? null
    : null

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(TH_LOCALE, { timeZone: TH_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '--:--'

  function toggleSession(key: string) {
    setSelectedKey(prev => prev === key ? null : key)
  }

  return (
    <div className="space-y-4 w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitor</h1>
          <p className="text-sm text-zinc-500 mt-0.5">อัปเดต {updatedStr}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Stats pills */}
          {stats && (
            <div className="flex gap-2 flex-wrap text-sm">
              <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#1e293b', color: '#94a3b8' }}>
                🤖 {stats.totalAgents} agents
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#1e293b', color: '#fbbf24' }}>
                ⚡ {stats.activeNow} active
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#1e293b', color: '#94a3b8' }}>
                💬 {stats.todayMessages} วันนี้
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#1e293b', color: '#94a3b8' }}>
                ⏱ avg {stats.avgResponseTime.toFixed(1)}s
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#1e293b', color: '#34d399' }}>
                ฿{(stats.totalCostToday * 35).toFixed(2)}
              </span>
              {stats.errors > 0 && (
                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#450a0a', color: '#f87171' }}>
                  🚨 {stats.errors} errors
                </span>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="text-sm px-3 py-1.5 rounded-lg border transition-colors hover:bg-zinc-800"
              style={{ borderColor: '#1e293b', color: '#64748b' }}
            >
              คู่มือ
            </button>
            <button
              type="button"
              onClick={() => setPaused(p => !p)}
              className="text-sm px-3 py-1.5 rounded-lg border transition-colors hover:bg-zinc-800 flex items-center gap-1.5"
              style={{ borderColor: paused ? '#7f1d1d' : '#1e293b', color: paused ? '#f87171' : '#64748b' }}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: paused ? '#475569' : '#34d399' }}>
              <span
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: paused ? '#334155' : '#34d399',
                  animation: paused ? 'none' : 'live-pulse 2s ease-in-out infinite',
                }}
              />
              {paused ? 'Paused' : 'Live'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Session List ── */}
      {sessions.length === 0 ? (
        <div className="text-center py-24 rounded-2xl border" style={{ borderColor: '#1e293b', background: '#0f172a' }}>
          <div className="text-5xl mb-4">🤖</div>
          <p className="text-lg font-medium" style={{ color: '#334155' }}>ยังไม่มี sessions</p>
          <p className="text-sm mt-1" style={{ color: '#1e293b' }}>gateway ยังไม่รัน หรือยังไม่มีคนคุย</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sessions.map(session => {
            const key = `${session.agentId}-${session.channel}-${session.sessionKey}`
            const isSelected = selectedKey === key
            return (
              <div key={key}>
                <SessionRow session={session} onClick={() => toggleSession(key)} isSelected={isSelected} />
                {isSelected && selectedSession && (
                  <TimelineDrawer session={selectedSession} onClose={() => setSelectedKey(null)} />
                )}
              </div>
            )
          })}
        </div>
      )}

      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />

      <style>{`
        @keyframes anim-think {
          0%, 100% { transform: rotate(-8deg) scale(1.0); }
          50%       { transform: rotate(8deg)  scale(1.1); }
        }
        @keyframes anim-search {
          0%, 100% { transform: scale(1.0) rotate(0deg); }
          50%       { transform: scale(1.1) rotate(-15deg); }
        }
        @keyframes anim-error {
          0%, 100%  { transform: rotate(0deg); }
          20%       { transform: rotate(-10deg); }
          40%       { transform: rotate(10deg); }
          60%       { transform: rotate(-10deg); }
          80%       { transform: rotate(10deg); }
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .anim-think  { animation: anim-think  1.8s ease-in-out infinite; display: inline-block; }
        .anim-search { animation: anim-search 1.2s ease-in-out infinite; display: inline-block; }
        .anim-error  { animation: anim-error  0.5s ease-in-out infinite; display: inline-block; }
      `}</style>
    </div>
  )
}
