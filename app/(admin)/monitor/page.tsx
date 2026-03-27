'use client'

import { useState } from 'react'
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

/** Parse "HH:MM:SS" into total seconds since midnight */
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
  idle:      { icon: '○', color: '#444',    label: 'IDLE',      animClass: '' },
  thinking:  { icon: '◉', color: '#f5c518', label: 'THINKING',  animClass: 'thinking-pulse' },
  tool_call: { icon: '⚡', color: '#a855f7', label: 'TOOL CALL', animClass: 'tool-flash' },
  replied:   { icon: '✓', color: '#22c55e', label: 'REPLIED',   animClass: '' },
  error:     { icon: '✗', color: '#ef4444', label: 'ERROR',     animClass: 'error-shake' },
}

function getStateConfig(state: string) {
  return STATE_CONFIG[state] ?? STATE_CONFIG.idle
}

// ─── Event Icon & Color ────────────────────────────────────────────────────────
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

function eventItalic(type: string): boolean {
  return type === 'thinking'
}

// ─── RPG Progress Bar ─────────────────────────────────────────────────────────
function ProgressBar({ state, elapsed, lastMessageAt }: { state: string; elapsed: number; lastMessageAt: string | null }) {
  if (state === 'idle') {
    return (
      <div className="font-mono" style={{ fontSize: 12, color: '#444' }}>
        IDLE — last active {lastMessageAt ? relativeTime(lastMessageAt) : 'unknown'}
      </div>
    )
  }

  const cfg = getStateConfig(state)
  const bars = 24
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
    <div className={`font-mono ${cfg.animClass}`} style={{ fontSize: 12, color: cfg.color }}>
      [{barStr}] {label}
    </div>
  )
}

// ─── State Badge ──────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: string }) {
  const cfg = getStateConfig(state)
  return (
    <span
      className={`font-mono ${cfg.animClass}`}
      style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 9,
        color: cfg.color,
        border: `1px solid ${cfg.color}`,
        borderRadius: 9999,
        padding: '2px 8px',
        background: `${cfg.color}18`,
        letterSpacing: 1,
      }}
    >
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ─── Session Timeline ─────────────────────────────────────────────────────────
function SessionTimeline({ events }: { events: MonitorEvent[] }) {
  const shown = events.slice(-10)
  return (
    <div className="font-mono space-y-0.5" style={{ fontSize: 12 }}>
      {shown.map((e, i) => {
        const prev = shown[i - 1]
        const delta = prev ? deltaLabel(prev.ts, e.ts) : null
        const tsShort = e.ts.length >= 8 ? e.ts.slice(0, 8) : e.ts
        return (
          <div key={i}>
            {delta && (
              <div style={{ color: '#444', paddingLeft: 80, lineHeight: 1.4 }}>↓ {delta}</div>
            )}
            <div className="flex gap-2 items-start" style={{ lineHeight: 1.6 }}>
              <span className="shrink-0" style={{ color: '#555', minWidth: 70 }}>{tsShort}</span>
              <span className="shrink-0" style={{ minWidth: 20 }}>{eventIcon(e.type)}</span>
              <span
                style={{
                  color: eventColor(e.type),
                  fontStyle: eventItalic(e.type) ? 'italic' : undefined,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {e.text}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Flat Session (with agent/channel metadata) ───────────────────────────────
interface FlatSession extends MonitorSession {
  agentId: string
  channel: 'webchat' | 'telegram'
}

function sortOrder(state: string): number {
  if (state === 'thinking' || state === 'tool_call') return 0
  if (state === 'replied') return 1
  if (state === 'error') return 2
  return 3 // idle
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

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session }: { session: FlatSession }) {
  const cfg = getStateConfig(session.state)
  const isIdle = session.state === 'idle'
  const channelLabel = session.channel === 'webchat' ? 'webchat' : 'telegram'

  const borderColors: Record<string, string> = {
    idle: '#1e1e1e', thinking: '#f5c518', tool_call: '#a855f7', replied: '#22c55e', error: '#ef4444',
  }

  return (
    <div
      className="rounded border fade-in"
      style={{
        background: '#111',
        borderColor: borderColors[session.state] ?? '#1e1e1e',
        opacity: isIdle ? 0.5 : 1,
        padding: '14px 16px',
        transition: 'opacity 0.3s',
      }}
    >
      {/* ── Card Header ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 font-mono" style={{ fontSize: 13 }}>
          <span className={cfg.animClass} style={{ color: cfg.color, fontSize: 16, lineHeight: 1 }}>
            {cfg.icon}
          </span>
          <span style={{ color: '#e0e0e0', fontFamily: '"Press Start 2P", monospace', fontSize: 10 }}>
            {session.agentId}
          </span>
          <span style={{ color: '#444' }}>›</span>
          <span style={{ color: '#888' }}>{channelLabel}</span>
          <span style={{ color: '#555' }}>|</span>
          <span style={{ color: '#bbb' }}>{session.user}</span>
        </div>
        <StateBadge state={session.state} />
      </div>

      {/* ── Progress Bar ── */}
      <div className="mb-3">
        <ProgressBar
          state={session.state}
          elapsed={session.elapsed}
          lastMessageAt={session.lastMessageAt}
        />
      </div>

      {/* ── Timeline ── */}
      {session.events.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: '#1a1a1a' }}>
          <p style={{ color: '#444', fontSize: 11, marginBottom: 6, fontFamily: '"Press Start 2P", monospace' }}>
            TIMELINE
          </p>
          <SessionTimeline events={session.events} />
        </div>
      )}

      {/* ── Cost / meta (bottom right) ── */}
      {(session.cost > 0 || session.lastMessageAt) && (
        <div className="flex gap-4 mt-3 font-mono" style={{ fontSize: 11, color: '#444' }}>
          {session.lastMessageAt && <span>{relativeTime(session.lastMessageAt)}</span>}
          {session.cost > 0 && <span style={{ color: '#555' }}>฿{(session.cost * 35).toFixed(4)}</span>}
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
          <DialogTitle style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 13 }}>
            ░▒▓ MONITOR GUIDE ▓▒░
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-2">สถานะ Session</p>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center gap-3"><span style={{ color: '#444' }}>○ IDLE</span><span className="text-zinc-500">รอ message — ไม่มี activity</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#f5c518' }}>◉ THINKING</span><span className="text-zinc-500">AI กำลังคิดและประมวลผล</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#a855f7' }}>⚡ TOOL CALL</span><span className="text-zinc-500">เรียก MCP / ค้นข้อมูล ERP</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#22c55e' }}>✓ REPLIED</span><span className="text-zinc-500">ตอบกลับ user แล้ว</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#ef4444' }}>✗ ERROR</span><span className="text-zinc-500">เกิดข้อผิดพลาด</span></div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Event Icons</p>
            <div className="space-y-1 font-mono text-xs">
              <div className="flex gap-3"><span>✉</span><span className="text-zinc-500">User ส่ง message เข้ามา</span></div>
              <div className="flex gap-3"><span>🧠</span><span className="text-zinc-500">AI กำลัง thinking (extended)</span></div>
              <div className="flex gap-3"><span>⚡</span><span className="text-zinc-500">Tool call — เรียก MCP / ERP</span></div>
              <div className="flex gap-3"><span>✅</span><span className="text-zinc-500">ตอบกลับสำเร็จ</span></div>
              <div className="flex gap-3"><span>❌</span><span className="text-zinc-500">Error — ดู logs เพิ่มเติม</span></div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Timeline</p>
            <div className="space-y-1 font-mono text-xs text-zinc-500">
              <p>แสดง max 10 events ล่าสุดต่อ session</p>
              <p>↓ Xs = เวลาที่ใช้ระหว่าง event</p>
              <p>sort: active states ก่อน, แล้ว replied, แล้ว idle</p>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Stats Bar</p>
            <div className="space-y-1 font-mono text-xs text-zinc-500">
              <p>AGENTS = จำนวน agent ทั้งหมด</p>
              <p>ACTIVE = session ที่ active ใน 5 นาทีล่าสุด</p>
              <p>TODAY = messages ทั้งหมดวันนี้ (ทุก channel)</p>
              <p>AVG = เวลาตอบเฉลี่ย (วินาที)</p>
              <p>COST = ค่าใช้จ่าย LLM วันนี้ (บาท)</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400">* อัปเดตทุก 3 วินาที — delay สูงสุด 3s จาก event จริง</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const [paused, setPaused] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['monitor'],
    queryFn: getMonitorEvents,
    refetchInterval: paused ? false : 3000,
  })

  const stats = data?.stats
  const agents = data?.agents ?? []
  const sessions = flattenSessions(agents)

  const updatedStr = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH') : '--:--:--'

  return (
    <div className="rounded-lg space-y-4" style={{ background: '#0d0d0d', color: '#e0e0e0', padding: '1rem', position: 'relative' }}>
      {/* scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-lg"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)',
          zIndex: 1,
        }}
      />

      <div className="relative space-y-4" style={{ zIndex: 2 }}>

        {/* ── Header ── */}
        <div
          className="border rounded px-4 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{ borderColor: '#f5c518', background: '#111' }}
        >
          <div>
            <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 13, color: '#f5c518' }}>
              ░▒▓ OPENCLAW MONITOR ▓▒░
            </h1>
            <p className="font-mono mt-1" style={{ color: '#555', fontSize: 11 }}>
              {updatedStr} · poll 3s
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {stats && (
              <div className="font-mono flex gap-4 flex-wrap items-center" style={{ fontSize: 12 }}>
                <span style={{ color: '#888' }}>AGENTS:<span style={{ color: '#e0e0e0' }}> {stats.totalAgents}</span></span>
                <span style={{ color: '#888' }}>ACTIVE:<span style={{ color: '#f5c518' }}> {stats.activeNow}</span></span>
                <span style={{ color: '#888' }}>TODAY:<span style={{ color: '#e0e0e0' }}> {stats.todayMessages}</span></span>
                <span style={{ color: '#888' }}>AVG:<span style={{ color: '#e0e0e0' }}> {stats.avgResponseTime.toFixed(1)}s</span></span>
                <span style={{ color: '#888' }}>COST:<span style={{ color: '#22c55e' }}> ฿{(stats.totalCostToday * 35).toFixed(2)}</span></span>
                {stats.errors > 0 && <span style={{ color: '#ef4444' }}>ERR: {stats.errors}</span>}
              </div>
            )}

            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="font-mono px-2.5 py-1 rounded border transition-colors hover:bg-zinc-800"
                style={{ borderColor: '#444', color: '#888', fontSize: 11, fontFamily: '"Press Start 2P", monospace' }}
              >
                INFO
              </button>
              <button
                type="button"
                onClick={() => setPaused(p => !p)}
                className="font-mono px-2.5 py-1 rounded border transition-colors hover:bg-zinc-800"
                style={{
                  borderColor: paused ? '#ef4444' : '#444',
                  color: paused ? '#ef4444' : '#888',
                  fontSize: 11,
                  fontFamily: '"Press Start 2P", monospace',
                }}
              >
                {paused ? '▶ RESUME' : '⏸ PAUSE'}
              </button>
              <span className="font-mono flex items-center gap-1.5" style={{ fontSize: 11 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: paused ? '#555' : '#22c55e',
                    animation: paused ? 'none' : 'thinking-pulse 1.5s ease-in-out infinite',
                  }}
                />
                <span style={{ color: paused ? '#555' : '#22c55e' }}>{paused ? 'PAUSED' : 'LIVE'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Session List ── */}
        {sessions.length === 0 ? (
          <div className="text-center py-24 font-mono" style={{ color: '#333' }}>
            <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 14 }}>
              NO ACTIVE SESSIONS<span className="blink-cursor">_</span>
            </p>
            <p className="mt-3" style={{ fontSize: 11, color: '#2a2a2a' }}>
              gateway not running or no sessions yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => (
              <SessionCard key={`${session.agentId}-${session.channel}-${session.sessionKey}`} session={session} />
            ))}
          </div>
        )}

      </div>

      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

        @keyframes thinking-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes tool-flash {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
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
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .thinking-pulse { animation: thinking-pulse 1.5s ease-in-out infinite; }
        .tool-flash     { animation: tool-flash 0.4s ease-in-out infinite; }
        .error-shake    { animation: error-shake 0.3s ease-in-out infinite; }
        .blink-cursor   { animation: blink 1s step-start infinite; }
        .fade-in        { animation: fade-in 0.35s ease-out both; }
      `}</style>
    </div>
  )
}
