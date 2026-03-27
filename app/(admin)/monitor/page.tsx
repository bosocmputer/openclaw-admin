'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMonitorEvents, type MonitorAgent, type MonitorEvent } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ─── 8-bit Character ─────────────────────────────────────────────────────────
function PixelChar({ state }: { state: string }) {
  const configs: Record<string, { eyes: string; arms: string; extra: string; color: string; anim: string }> = {
    idle:      { eyes: '──', arms: '/||\\', extra: 'ZZZ', color: '#555', anim: 'animate-pulse-slow' },
    thinking:  { eyes: '◉◉', arms: '\\||/', extra: '💭', color: '#f5c518', anim: 'animate-bounce' },
    tool_call: { eyes: '◉◉', arms: '|██|', extra: '⚡', color: '#a855f7', anim: 'animate-ping-slow' },
    replied:   { eyes: '★★', arms: '\\||/', extra: '✓', color: '#22c55e', anim: '' },
    error:     { eyes: '><', arms: '\\/\\/', extra: '✗', color: '#ef4444', anim: 'animate-shake' },
  }
  const c = configs[state] ?? configs.idle
  return (
    <div className="flex flex-col items-center font-mono text-xs leading-tight select-none" style={{ color: c.color }}>
      <div className={`text-lg ${c.anim}`} style={{ fontFamily: 'monospace', lineHeight: 1.2 }}>
        <div>▄▀▀▀▄</div>
        <div>█{c.eyes}█ {c.extra}</div>
        <div>█&nbsp;&nbsp;&nbsp;&nbsp;█</div>
        <div>▀███▀</div>
        <div>&nbsp;{c.arms}</div>
      </div>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ state, elapsed }: { state: string; elapsed: number }) {
  const configs: Record<string, { color: string; label: string; fill: number }> = {
    idle:      { color: '#444', label: 'IDLE', fill: 0 },
    thinking:  { color: '#f5c518', label: `THINKING ${elapsed}s`, fill: Math.min((elapsed / 60) * 100, 90) },
    tool_call: { color: '#a855f7', label: 'TOOL CALL', fill: 70 },
    replied:   { color: '#22c55e', label: 'REPLIED ✓', fill: 100 },
    error:     { color: '#ef4444', label: 'ERROR ✗', fill: 100 },
  }
  const c = configs[state] ?? configs.idle
  const bars = 20
  const filled = Math.round((c.fill / 100) * bars)
  return (
    <div className="font-mono text-xs mt-2">
      <span style={{ color: c.color }}>
        [{('▓'.repeat(filled) + '░'.repeat(bars - filled))}] {c.label}
      </span>
    </div>
  )
}

// ─── Event Icon ───────────────────────────────────────────────────────────────
function eventIcon(type: string) {
  if (type === 'message') return '✉'
  if (type === 'thinking') return '🧠'
  if (type === 'tool') return '⚡'
  if (type === 'reply') return '✅'
  if (type === 'error') return '❌'
  return '·'
}

// ─── Session Row ──────────────────────────────────────────────────────────────
function SessionDot({ state }: { state: string }) {
  const colors: Record<string, string> = {
    thinking: '#f5c518', tool_call: '#a855f7', replied: '#22c55e', error: '#ef4444', idle: '#444',
  }
  return <span style={{ color: colors[state] ?? '#444' }}>●</span>
}

// ─── Agent Card ───────────────────────────────────────────────────────────────
interface Session {
  sessionKey: string
  user: string
  state: string
  lastMessageAt: string | null
  lastUserText: string | null
  lastReplyText: string | null
  elapsed: number
  cost: number
  events: MonitorEvent[]
}

function AgentCard({ agent, channelType, roomName }: { agent: MonitorAgent; channelType: 'webchat' | 'telegram'; roomName?: string }) {
  const sessions: Session[] = (channelType === 'webchat' ? agent.channels.webchat : agent.channels.telegram) ?? []
  const overallState = sessions.find(s => s.state === 'error')?.state
    ?? sessions.find(s => s.state === 'thinking' || s.state === 'tool_call')?.state
    ?? sessions.find(s => s.state === 'replied')?.state
    ?? 'idle'
  const elapsed = sessions.find(s => s.state === 'thinking')?.elapsed ?? 0

  const borderColors: Record<string, string> = {
    idle: '#222', thinking: '#f5c518', tool_call: '#a855f7', replied: '#22c55e', error: '#ef4444',
  }

  // รวม events ล่าสุดจากทุก session
  const allEvents = sessions.flatMap(s => s.events.map(e => ({ ...e, user: s.user })))
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 6)

  return (
    <div
      className="rounded border flex flex-col"
      style={{ background: '#111', borderColor: borderColors[overallState] ?? '#222', minHeight: 280 }}
    >
      {/* header */}
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: '#222' }}>
        <div>
          <p className="font-mono text-xs font-bold" style={{ color: '#e0e0e0', fontFamily: '"Press Start 2P", monospace', fontSize: 9 }}>
            {channelType === 'webchat' ? `[${roomName ?? agent.id}]` : `@${agent.id}_bot`}
          </p>
          <p className="font-mono text-xs mt-0.5" style={{ color: '#555', fontSize: 9 }}>AGENT: {agent.id}</p>
        </div>
        <span className="font-mono text-xs" style={{ color: '#555', fontSize: 9 }}>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* character */}
      <div className="flex flex-col items-center py-3">
        <PixelChar state={overallState} />
        <ProgressBar state={overallState} elapsed={elapsed} />
      </div>

      {/* sessions */}
      {sessions.length > 0 && (
        <div className="px-3 pb-2 space-y-1.5">
          <p className="font-mono text-xs mb-1" style={{ color: '#555', fontSize: 9 }}>SESSIONS</p>
          {sessions.map(s => (
            <div key={s.sessionKey} className="space-y-0.5 font-mono" style={{ fontSize: 10 }}>
              <div className="flex items-center gap-1.5">
                <SessionDot state={s.state} />
                <span style={{ color: '#aaa' }}>{s.user}</span>
                {s.state === 'idle' && s.lastMessageAt && (
                  <span style={{ color: '#444' }}>last: {relativeTime(s.lastMessageAt)}</span>
                )}
                {s.cost > 0 && (
                  <span style={{ color: '#444' }} className="ml-auto shrink-0">฿{(s.cost * 35).toFixed(3)}</span>
                )}
              </div>
              {s.lastUserText && (
                <div style={{ color: '#666', paddingLeft: 14 }}>
                  <span style={{ color: '#555' }}>▶ </span>{s.lastUserText}
                </div>
              )}
              {s.lastReplyText && (
                <div style={{ color: '#4a9', paddingLeft: 14 }}>
                  <span style={{ color: '#3a8' }}>◀ </span>{s.lastReplyText}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* events feed */}
      <div className="px-3 pb-3 mt-auto">
        <div className="border-t pt-2 space-y-1" style={{ borderColor: '#1a1a1a' }}>
          {allEvents.length === 0 && (
            <p className="font-mono text-xs" style={{ color: '#333', fontSize: 9 }}>no recent activity</p>
          )}
          {allEvents.map((e, i) => (
            <div key={i} className="font-mono" style={{ fontSize: 10 }}>
              <div className="flex gap-1.5 items-start">
                <span style={{ color: '#444' }} className="shrink-0">{e.ts.slice(11, 19)}</span>
                <span className="shrink-0">{eventIcon(e.type)}</span>
                <span style={{ color: '#777' }}>{e.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Info Dialog ──────────────────────────────────────────────────────────────
function InfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 11 }}>
            ░▒▓ MONITOR GUIDE ▓▒░
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-2">สถานะ Agent (Character)</p>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center gap-3"><span style={{ color: '#555' }}>██ IDLE</span><span className="text-zinc-500">รอ message — ไม่มี activity</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#f5c518' }}>██ THINKING</span><span className="text-zinc-500">AI กำลังคิดและประมวลผล</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#a855f7' }}>██ TOOL CALL</span><span className="text-zinc-500">เรียก MCP / ค้นข้อมูล ERP</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#22c55e' }}>██ REPLIED</span><span className="text-zinc-500">ตอบกลับ user แล้ว</span></div>
              <div className="flex items-center gap-3"><span style={{ color: '#ef4444' }}>██ ERROR</span><span className="text-zinc-500">เกิดข้อผิดพลาด</span></div>
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
            <p className="font-semibold mb-2">Sessions</p>
            <div className="space-y-1 font-mono text-xs text-zinc-500">
              <p><span style={{ color: '#f5c518' }}>●</span> สีเหลือง = กำลัง active อยู่</p>
              <p><span style={{ color: '#22c55e' }}>●</span> สีเขียว = ตอบแล้วล่าสุด</p>
              <p><span style={{ color: '#ef4444' }}>●</span> สีแดง = มี error</p>
              <p><span style={{ color: '#444' }}>●</span> สีเทา = idle / ไม่มี activity</p>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Stats Bar</p>
            <div className="space-y-1 font-mono text-xs text-zinc-500">
              <p>ACTIVE = จำนวน agent ที่มี activity ใน 5 นาทีล่าสุด</p>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
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
  const globalEvents = data?.globalEvents ?? []

  // webchat agents = agents ที่มี webchat sessions
  const webchatAgents = agents.filter(a => (a.channels.webchat?.length ?? 0) > 0)
  // telegram agents = agents ที่มี telegram sessions
  const telegramAgents = agents.filter(a => (a.channels.telegram?.length ?? 0) > 0)

  const updatedStr = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH') : '--:--:--'

  return (
    <div className="rounded-lg space-y-4" style={{ background: '#0d0d0d', color: '#e0e0e0', padding: '1rem', position: 'relative' }}>
      {/* scanline overlay */}
      <div className="absolute inset-0 pointer-events-none rounded-lg" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        zIndex: 1,
      }} />

      <div className="relative space-y-4" style={{ zIndex: 2 }}>

        {/* ── Header ── */}
        <div className="border rounded px-4 py-3 flex items-center justify-between flex-wrap gap-2"
          style={{ borderColor: '#f5c518', background: '#111' }}>
          <div>
            <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 11, color: '#f5c518' }}>
              ░▒▓ OPENCLAW MONITOR ▓▒░
            </h1>
            <p className="font-mono text-xs mt-1" style={{ color: '#555', fontSize: 9 }}>
              {updatedStr} · poll 3s
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {stats && (
              <div className="font-mono text-xs flex gap-4 flex-wrap" style={{ fontSize: 9 }}>
                <span style={{ color: '#888' }}>AGENTS:<span style={{ color: '#e0e0e0' }}> {stats.totalAgents}</span></span>
                <span style={{ color: '#888' }}>ACTIVE:<span style={{ color: '#f5c518' }}> {stats.activeNow}</span></span>
                <span style={{ color: '#888' }}>TODAY:<span style={{ color: '#e0e0e0' }}> {stats.todayMessages}</span></span>
                <span style={{ color: '#888' }}>AVG:<span style={{ color: '#e0e0e0' }}> {stats.avgResponseTime.toFixed(1)}s</span></span>
                <span style={{ color: '#888' }}>COST:<span style={{ color: '#22c55e' }}> ฿{(stats.totalCostToday * 35).toFixed(2)}</span></span>
                {stats.errors > 0 && <span style={{ color: '#ef4444' }}>ERR: {stats.errors}</span>}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="font-mono text-xs px-2.5 py-1 rounded border transition-colors hover:bg-zinc-800"
                style={{ borderColor: '#444', color: '#888', fontSize: 9, fontFamily: '"Press Start 2P", monospace' }}
              >
                INFO
              </button>
              <button
                type="button"
                onClick={() => setPaused(p => !p)}
                className="font-mono text-xs px-2.5 py-1 rounded border transition-colors hover:bg-zinc-800"
                style={{ borderColor: paused ? '#ef4444' : '#444', color: paused ? '#ef4444' : '#888', fontSize: 9, fontFamily: '"Press Start 2P", monospace' }}
              >
                {paused ? '▶ RESUME' : '⏸ PAUSE'}
              </button>
              <span className="font-mono text-xs flex items-center gap-1" style={{ fontSize: 9 }}>
                <span className={`inline-block w-2 h-2 rounded-full ${paused ? 'bg-zinc-600' : 'animate-pulse bg-green-500'}`} />
                <span style={{ color: paused ? '#555' : '#22c55e' }}>{paused ? 'PAUSED' : 'LIVE'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── TELEGRAM section ── */}
        {telegramAgents.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-xs px-1" style={{ color: '#f5c518', fontFamily: '"Press Start 2P", monospace', fontSize: 9 }}>
              ▌TELEGRAM
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {telegramAgents.map(agent => (
                <AgentCard key={`tg-${agent.id}`} agent={agent} channelType="telegram" />
              ))}
            </div>
          </div>
        )}

        {/* ── WEBCHAT section ── */}
        {webchatAgents.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-xs px-1" style={{ color: '#3b82f6', fontFamily: '"Press Start 2P", monospace', fontSize: 9 }}>
              ▌WEBCHAT
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {webchatAgents.map(agent => (
                <AgentCard key={`wc-${agent.id}`} agent={agent} channelType="webchat" />
              ))}
            </div>
          </div>
        )}

        {agents.length === 0 && (
          <div className="text-center py-20 font-mono" style={{ color: '#333', fontFamily: '"Press Start 2P", monospace', fontSize: 10 }}>
            <p>NO AGENTS FOUND</p>
            <p className="mt-2 text-xs" style={{ fontSize: 8 }}>gateway not running or no sessions yet</p>
          </div>
        )}

        {/* ── Global Feed ── */}
        <div className="border rounded" style={{ borderColor: '#222', background: '#111' }}>
          <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: '#1a1a1a' }}>
            <p className="font-mono" style={{ color: '#888', fontFamily: '"Press Start 2P", monospace', fontSize: 9 }}>▌GLOBAL FEED</p>
            <span className="font-mono text-xs" style={{ color: '#444', fontSize: 9 }}>last 50 events</span>
          </div>
          <div className="p-3 space-y-1 max-h-48 overflow-y-auto font-mono" style={{ fontSize: 11 }}>
            {globalEvents.length === 0 && (
              <p style={{ color: '#333', fontSize: 9 }}>_ no events yet</p>
            )}
            {globalEvents.map((e, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span style={{ color: '#444' }} className="shrink-0">{String(e.ts).slice(11, 19)}</span>
                <span style={{ color: '#555' }} className="shrink-0">[{e.agentId}/{e.channel}]</span>
                <span className="shrink-0">{eventIcon(e.type)}</span>
                <span style={{ color: '#777' }} className="truncate">{e.user && <span style={{ color: '#555' }}>{e.user}: </span>}{e.text}</span>
              </div>
            ))}
            <p style={{ color: '#444' }}>_</p>
          </div>
        </div>

      </div>

      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes pulse-slow { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes ping-slow { 0%{opacity:1} 50%{opacity:0.5} 100%{opacity:1} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
        .animate-ping-slow { animation: ping-slow 0.5s ease-in-out infinite; }
        .animate-shake { animation: shake 0.3s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
