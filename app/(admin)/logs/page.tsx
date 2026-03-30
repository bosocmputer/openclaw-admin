'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LogEntry {
  time: string
  level: string
  subsystem: string
  msg: string
}

async function fetchLogs(lines: number): Promise<LogEntry[]> {
  const { data } = await api.get(`/api/gateway/logs?lines=${lines}`)
  return data
}

function levelColor(level: string) {
  switch (level.toUpperCase()) {
    case 'ERROR': return 'text-red-500'
    case 'WARN':  return 'text-yellow-500'
    case 'DEBUG': return 'text-zinc-400'
    default:      return 'text-zinc-300'
  }
}


function formatTime(iso: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

export default function LogsPage() {
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const [paused, setPaused] = useState(false)
  const [lines, setLines] = useState(300)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: logs = [], dataUpdatedAt } = useQuery({
    queryKey: ['gateway-logs', lines],
    queryFn: () => fetchLogs(lines),
    refetchInterval: paused ? false : 3000,
  })

  const filtered = logs.filter(entry => {
    const msg = typeof entry.msg === 'object' ? JSON.stringify(entry.msg) : String(entry.msg ?? '')
    const level = String(entry.level ?? '')
    const subsystem = String(entry.subsystem ?? '')
    if (levelFilter !== 'ALL' && level.toUpperCase() !== levelFilter) return false
    if (filter) {
      const q = filter.toLowerCase()
      return msg.toLowerCase().includes(q) || subsystem.toLowerCase().includes(q)
    }
    return true
  })

  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [dataUpdatedAt, autoScroll, paused])

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('th-TH') : '-'

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logs</h1>
          <p className="text-sm text-zinc-500 mt-1">Gateway log แบบ live — อัปเดตทุก 3 วินาที</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>อัปเดตล่าสุด: {lastUpdate}</span>
          <Button
            size="sm"
            variant={paused ? 'default' : 'outline'}
            onClick={() => setPaused(v => !v)}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <Input
          placeholder="ค้นหา message หรือ subsystem..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="max-w-sm text-sm"
        />
        <div className="flex gap-1">
          {['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLevelFilter(l)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                levelFilter === l
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto items-center">
          <span className="text-xs text-zinc-400 mr-1">บรรทัด:</span>
          {[100, 300, 1000].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setLines(n)}
              className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                lines === n
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto scroll
        </label>
      </div>

      {/* Log panel */}
      <div className="border rounded-xl bg-zinc-950 text-xs font-mono h-[580px] overflow-y-auto p-3 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-zinc-500 py-4 text-center">ไม่มี log ที่ตรงเงื่อนไข</p>
        )}
        {filtered.map((entry, i) => (
          <div key={i} className="flex gap-2 hover:bg-zinc-900 px-1 rounded leading-5">
            <span className="text-zinc-600 shrink-0 w-20">{formatTime(String(entry.time ?? ''))}</span>
            <span className={`shrink-0 w-12 ${levelColor(String(entry.level ?? ''))}`}>
              {String(entry.level ?? '').toUpperCase().slice(0, 4)}
            </span>
            {entry.subsystem && (
              <span className="text-blue-400 shrink-0 max-w-[180px] truncate">{String(entry.subsystem)}</span>
            )}
            <span className="text-zinc-300 break-all">
              {typeof entry.msg === 'object' ? JSON.stringify(entry.msg) : String(entry.msg ?? '')}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <p className="text-xs text-zinc-400">{filtered.length} entries</p>
    </div>
  )
}
