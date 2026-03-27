'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, type MonitorAgent, type MonitorSession, type MonitorEvent } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function parseTs(ts: string): number {
  const parts = ts.split(':')
  if (parts.length < 3) return 0
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
}

function deltaLabel(prev: string, next: string): string {
  const diff = Math.abs(parseTs(next) - parseTs(prev))
  return diff < 1 ? `${(diff * 1000).toFixed(0)}ms` : `${diff.toFixed(1)}s`
}

// ─── State Config ─────────────────────────────────────────────────────────────
const STATE_CONFIG: Record<string, { icon: string; color: string; label: string; animClass: string }> = {
  idle:      { icon: '○', color: '#555',    label: 'IDLE',      animClass: '' },
  thinking:  { icon: '◉', color: '#f5c518', label: 'THINKING',  animClass: 'thinking-pulse' },
  tool_call: { icon: '⚡', color: '#a855f7', label: 'TOOL CALL', animClass: 'tool-flash' },
  replied:   { icon: '✓', color: '#22c55e', label: 'REPLIED',   animClass: '' },
  error:     { icon: '✗', color: '#ef4444', label: 'ERROR',     animClass: 'error-shake' },
}

function getStateConfig(state: string) {
  return STATE_CONFIG[state] ?? STATE_CONFIG.idle
}

// ─── Event helpers ─────────────────────────────────────────────────────────────
function eventIcon(type: string): string {
  if (type === 'message')  return '✉'
  if (type === 'thinking') return '🧠'
  if (type === 'tool')     return '⚡'
  if (type === 'reply')    return '✅'
  if (type === 'error')    return '❌'
  return '·'
}

function eventColor(type: string): string {
  if (type === 'message')  return '#aaa'
  if (type === 'thinking') return '#666'
  if (type === 'tool')     return '#a855f7'
  if (type === 'reply')    return '#4ade80'
  if (type === 'error')    return '#ef4444'
  return '#555'
}

// ─── RPG Progress Bar ─────────────────────────────────────────────────────────
function ProgressBar({ state, elapsed, lastMessageAt }: { state: string; elapsed: number; lastMessageAt: string | null }) {
  if (state === 'idle') {
    return (
      <span className="font-mono" style={{ fontSize: 11, color: '#444' }}>
        last active {lastMessageAt ? relativeTime(lastMessageAt) : '—'}
      </span>
    )
  }

  const cfg = getStateConfig(state)
  const bars = 16
  let fillPct = 0
  let label = cfg.label

  if (state === 'thinking') {
    fillPct = Math.min((elapsed / 60) * 100, 90)
    label = `THINKING ${elapsed}s`
  } else if (state === 'tool_call') {
    fillPct = 70
    label = 'TOOL CALL'
  } else if (state === 'replied') {
    fillPct = 100
    label = 'REPLIED ✓'
  } else if (state === 'error') {
    fillPct = 100
    label = 'ERROR ✗'
  }

  const filled = Math.round((fillPct / 100) * bars)
  const barStr = '█'.repeat(filled) + '░'.repeat(bars - filled)

  return (
    <span className={`font-mono ${cfg.animClass}`} style={{ fontSize: 11, color: cfg.color }}>
      [{barStr}] {label}
    </span>
  )
}

// ─── State Badge ──────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: string }) {
  const cfg = getStateConfig(state)
  return (
    <span
      className={`font-mono shrink-0 ${cfg.animClass}`}
      style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 8,
        color: cfg.color,
        border: `1px solid ${cfg.color}`,
        borderRadius: 9999,
        padding: '2px 7px',
        background: `${cfg.color}18`,
        letterSpacing: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ─── Timeline Panel (shown inside drawer) ─────────────────────────────────────
function TimelinePanel({ events }: { events: MonitorEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="font-mono text-center py-12" style={{ color: '#333', fontSize: 12 }}>
        no events yet
      </div>
    )
  }

  return (
    <div className="font-mono space-y-0" style={{ fontSize: 13 }}>
      {events.map((e, i) => {
        const prev = events[i - 1]
        const delta = prev ? deltaLabel(prev.ts, e.ts) : null
        const tsShort = e.ts.length >= 8 ? e.ts.slice(0, 8) : e.ts
        return (
          <div key={i}>
            {delta && (
              <div style={{ color: '#333', paddingLeft: 90, lineHeight: 1.6, fontSize: 11 }}>
                ↓ {delta}
              </div>
            )}
            <div className="flex gap-3 items-start" style={{ lineHeight: 1.8 }}>
              <span className="shrink-0" style={{ color: '#444', minWidth: 72 }}>{tsShort}</span>
              <span className="shrink-0" style={{ minWidth: 22 }}>{eventIcon(e.type)}</span>
              <span
                style={{
                  color: eventColor(e.type),
                  fontStyle: e.type === 'thinking' ? 'italic' : undefined,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  flex: 1,
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
    for (const s of agent.channels.webchat ?? []) {
      result.push({ ...s, agentId: agent.id, channel: 'webchat' })
    }
    for (const s of agent.channels.telegram ?? []) {
      result.push({ ...s, agentId: agent.id, channel: 'telegram' })
    }
  }
  result.sort((a, b) => {
    const orderDiff = sortOrder(a.state) - sortOrder(b.state)
    if (orderDiff !== 0) return orderDiff
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return tb - ta
  })
  return result
}

// ─── Session Row (compact, clickable) ─────────────────────────────────────────
function SessionRow({ session, onClick, isSelected }: { session: FlatSession; onClick: () => void; isSelected: boolean }) {
  const cfg = getStateConfig(session.state)
  const isIdle = session.state === 'idle'

  const borderColors: Record<string, string> = {
    idle: '#1a1a1a', thinking: '#f5c518', tool_call: '#a855f7', replied: '#22c55e', error: '#ef4444',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded border fade-in transition-all"
      style={{
        background: isSelected ? '#1a1a1a' : '#111',
        borderColor: isSelected ? (borderColors[session.state] ?? '#444') : (borderColors[session.state] ?? '#1a1a1a'),
        opacity: isIdle && !isSelected ? 0.45 : 1,
        padding: '12px 14px',
        outline: isSelected ? `1px solid ${borderColors[session.state] ?? '#444'}` : 'none',
        outlineOffset: 1,
        cursor: 'pointer',
      }}
    >
      {/* Row: icon · agent › channel | user  ···  progress bar  ···  badge */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* State icon */}
        <span className={cfg.animClass} style={{ color: cfg.color, fontSize: 15, lineHeight: 1, flexShrink: 0 }}>
          {cfg.icon}
        </span>

        {/* Agent + channel + user */}
        <div className="flex items-center gap-1.5 font-mono min-w-0" style={{ fontSize: 12 }}>
          <span style={{ color: '#e0e0e0', fontFamily: '"Press Start 2P", monospace', fontSize: 9 }}>
            {session.agentId}
          </span>
          <span style={{ color: '#333' }}>›</span>
          <span style={{ color: '#666' }}>{session.channel}</span>
          <span style={{ color: '#2a2a2a' }}>|</span>
          <span className="truncate" style={{ color: '#999', maxWidth: 120 }}>{session.user}</span>
        </div>

        {/* Separator */}
        <span style={{ flex: 1 }} />

        {/* Progress bar */}
        <ProgressBar state={session.state} elapsed={session.elapsed} lastMessageAt={session.lastMessageAt} />

        {/* Cost */}
        {session.cost > 0 && (
          <span className="font-mono" style={{ fontSize: 11, color: '#444' }}>
            ฿{(session.cost * 35).toFixed(3)}
          </span>
        )}

        {/* State badge */}
        <StateBadge state={session.state} />

        {/* Arrow hint */}
        <span style={{ color: isSelected ? '#888' : '#2a2a2a', fontSize: 12, flexShrink: 0 }}>
          {isSelected ? '▼' : '▶'}
        </span>
      </div>

      {/* Last user message preview (non-idle only) */}
      {!isIdle && session.lastUserText && (
        <div className="font-mono mt-1.5 truncate" style={{ fontSize: 11, color: '#555', paddingLeft: 22 }}>
          ✉ {session.lastUserText}
        </div>
      )}
    </button>
  )
}

// ─── Timeline Drawer (inline below the selected row) ──────────────────────────
function TimelineDrawer({ session, onClose }: { session: FlatSession; onClose: () => void }) {
  const cfg = getStateConfig(session.state)
  return (
    <div
      className="rounded border fade-in"
      style={{
        background: '#0a0a0a',
        borderColor: '#1e1e1e',
        padding: '16px 18px',
        marginTop: -4,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      }}
    >
      {/* Drawer header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-mono" style={{ fontSize: 11 }}>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#f5c518' }}>
            TIMELINE
          </span>
          <span style={{ color: '#333' }}>·</span>
          <span style={{ color: '#555' }}>{session.agentId}</span>
          <span style={{ color: '#333' }}>›</span>
          <span style={{ color: '#444' }}>{session.channel}</span>
          <span style={{ color: '#2a2a2a' }}>|</span>
          <span style={{ color: '#555' }}>{session.user}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono ${cfg.animClass}`} style={{ fontSize: 11, color: cfg.color }}>
            {cfg.icon} {cfg.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono rounded border transition-colors hover:bg-zinc-800"
            style={{ borderColor: '#333', color: '#555', fontSize: 10, padding: '2px 8px' }}
          >
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div
        style={{
          maxHeight: 420,
          overflowY: 'auto',
          borderTop: '1px solid #1a1a1a',
          paddingTop: 12,
        }}
      >
        <TimelinePanel events={session.events} />
      </div>

      {/* Last reply preview */}
      {session.lastReplyText && (
        <div
          className="font-mono mt-4 rounded p-3"
          style={{ background: '#111', borderLeft: '2px solid #22c55e', fontSize: 12, color: '#4ade80' }}
        >
          <span style={{ color: '#444', fontSize: 10 }}>LAST REPLY · </span>
          {session.lastReplyText.slice(0, 300)}{session.lastReplyText.length > 300 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

// ─── Info Dialog ──────────────────────────────────────────────────────────────
function InfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 12 }}>
            ░▒▓ MONITOR GUIDE ▓▒░
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-2">สถานะ Session</p>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center gap-3"><span style={{ color: '#555' }}>○ IDLE</span><span className="text-zinc-500">รอ message</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#f5c518' }}>◉ THINKING</span><span className="text-zinc-500">AI กำลังคิดและประมวลผล</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#a855f7' }}>⚡ TOOL CALL</span><span className="text-zinc-500">เรียก MCP / ค้นข้อมูล ERP</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#22c55e' }}>✓ REPLIED</span><span className="text-zinc-500">ตอบกลับ user แล้ว</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#ef4444' }}>✗ ERROR</span><span className="text-zinc-500">เกิดข้อผิดพลาด</span></div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">วิธีใช้</p>
            <div className="space-y-1 font-mono text-xs text-zinc-500">
              <p>กด session row เพื่อเปิด Timeline real-time</p>
              <p>↓ Xs = เวลาที่ใช้ระหว่าง event แต่ละขั้น</p>
              <p>active sessions ขึ้นก่อน, idle อยู่ล่างสุด (จาง)</p>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Stats Bar</p>
            <div className="space-y-1 font-mono text-xs text-zinc-500">
              <p>AGENTS = agent ทั้งหมด</p>
              <p>ACTIVE = active ใน 5 นาทีล่าสุด</p>
              <p>TODAY = messages ทั้งหมดวันนี้</p>
              <p>AVG = เวลาตอบเฉลี่ย (วินาที)</p>
              <p>COST = ค่าใช้จ่าย LLM วันนี้ (บาท)</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400">* อัปเดตทุก 3 วินาที</p>
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

  // keep selectedKey valid — find matching session from latest data
  const selectedSession = selectedKey
    ? sessions.find(s => `${s.agentId}-${s.channel}-${s.sessionKey}` === selectedKey) ?? null
    : null

  const updatedStr = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH') : '--:--:--'

  function toggleSession(key: string) {
    setSelectedKey(prev => prev === key ? null : key)
  }

  return (
    <div className="rounded-lg space-y-3" style={{ background: '#0d0d0d', color: '#e0e0e0', padding: '1rem', position: 'relative' }}>
      {/* scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-lg"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
          zIndex: 1,
        }}
      />

      <div className="relative space-y-3" style={{ zIndex: 2 }}>

        {/* ── Header ── */}
        <div
          className="border rounded px-4 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{ borderColor: '#f5c518', background: '#111' }}
        >
          <div>
            <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 12, color: '#f5c518' }}>
              ░▒▓ OPENCLAW MONITOR ▓▒░
            </h1>
            <p className="font-mono mt-1" style={{ color: '#555', fontSize: 10 }}>
              {updatedStr} · poll 3s
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {stats && (
              <div className="font-mono flex gap-3 flex-wrap items-center" style={{ fontSize: 11 }}>
                <span style={{ color: '#666' }}>AGENTS <span style={{ color: '#e0e0e0' }}>{stats.totalAgents}</span></span>
                <span style={{ color: '#666' }}>ACTIVE <span style={{ color: '#f5c518' }}>{stats.activeNow}</span></span>
                <span style={{ color: '#666' }}>TODAY <span style={{ color: '#e0e0e0' }}>{stats.todayMessages}</span></span>
                <span style={{ color: '#666' }}>AVG <span style={{ color: '#e0e0e0' }}>{stats.avgResponseTime.toFixed(1)}s</span></span>
                <span style={{ color: '#666' }}>COST <span style={{ color: '#22c55e' }}>฿{(stats.totalCostToday * 35).toFixed(2)}</span></span>
                {stats.errors > 0 && <span style={{ color: '#ef4444' }}>ERR {stats.errors}</span>}
              </div>
            )}

            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="font-mono px-2.5 py-1 rounded border transition-colors hover:bg-zinc-800"
                style={{ borderColor: '#333', color: '#666', fontSize: 9, fontFamily: '"Press Start 2P", monospace' }}
              >
                INFO
              </button>
              <button
                type="button"
                onClick={() => setPaused(p => !p)}
                className="font-mono px-2.5 py-1 rounded border transition-colors hover:bg-zinc-800"
                style={{
                  borderColor: paused ? '#ef4444' : '#333',
                  color: paused ? '#ef4444' : '#666',
                  fontSize: 9,
                  fontFamily: '"Press Start 2P", monospace',
                }}
              >
                {paused ? '▶ RESUME' : '⏸ PAUSE'}
              </button>
              <span className="font-mono flex items-center gap-1.5" style={{ fontSize: 10 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: paused ? '#444' : '#22c55e',
                    animation: paused ? 'none' : 'thinking-pulse 1.5s ease-in-out infinite',
                  }}
                />
                <span style={{ color: paused ? '#444' : '#22c55e' }}>{paused ? 'PAUSED' : 'LIVE'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Session List ── */}
        {sessions.length === 0 ? (
          <div className="text-center py-24 font-mono" style={{ color: '#2a2a2a' }}>
            <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 13 }}>
              NO ACTIVE SESSIONS<span className="blink-cursor">_</span>
            </p>
            <p className="mt-3" style={{ fontSize: 10, color: '#222' }}>
              gateway not running or no sessions yet
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map(session => {
              const key = `${session.agentId}-${session.channel}-${session.sessionKey}`
              const isSelected = selectedKey === key
              return (
                <div key={key}>
                  <SessionRow
                    session={session}
                    onClick={() => toggleSession(key)}
                    isSelected={isSelected}
                  />
                  {isSelected && selectedSession && (
                    <TimelineDrawer
                      session={selectedSession}
                      onClose={() => setSelectedKey(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

        @keyframes thinking-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @keyframes tool-flash {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes error-shake {
          0%, 100%  { transform: translateX(0); }
          25%       { transform: translateX(-3px); }
          75%       { transform: translateX(3px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .thinking-pulse { animation: thinking-pulse 1.5s ease-in-out infinite; }
        .tool-flash     { animation: tool-flash 0.4s ease-in-out infinite; }
        .error-shake    { animation: error-shake 0.3s ease-in-out infinite; }
        .blink-cursor   { animation: blink 1s step-start infinite; }
        .fade-in        { animation: fade-in 0.3s ease-out both; }
      `}</style>
    </div>
  )
}
