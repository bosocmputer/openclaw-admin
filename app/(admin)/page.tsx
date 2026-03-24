'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStatus, getAgents, getConfig, restartGateway, getDoctorStatus, runDoctorFix } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function DashboardPage() {
  const qc = useQueryClient()

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 15000,
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  })

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
  })

  const restart = useMutation({
    mutationFn: restartGateway,
    onSuccess: () => {
      toast.success('Gateway restarting...')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['status'] }), 3000)
    },
    onError: () => toast.error('Failed to restart gateway'),
  })

  const { data: doctorStatus, isLoading: doctorLoading, refetch: refetchDoctor } = useQuery({
    queryKey: ['doctor-status'],
    queryFn: getDoctorStatus,
    refetchInterval: 60000,
  })

  const doctorFix = useMutation({
    mutationFn: runDoctorFix,
    onSuccess: () => {
      toast.success('Doctor fix applied — gateway restarted')
      refetchDoctor()
      setTimeout(() => qc.invalidateQueries({ queryKey: ['status'] }), 3000)
    },
    onError: () => toast.error('Doctor fix failed'),
  })

  const totalUsers = agents?.reduce((sum, a) => sum + (a.users?.length ?? 0), 0) ?? 0
  const allAccounts = Object.entries(config?.channels?.telegram?.accounts ?? {}).filter(([, acc]) => acc.botToken)
  const topLevelToken = config?.channels?.telegram?.botToken
  const botCount = allAccounts.length + (topLevelToken && !allAccounts.length ? 1 : 0)
  const botToken = allAccounts.length > 0 || topLevelToken
  const model = config?.agents?.defaults?.model?.primary ?? '-'

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">OpenClaw ERP Chatbot Admin</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Gateway Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            {statusLoading ? (
              <span className="text-sm text-zinc-400">Checking...</span>
            ) : (
              <Badge variant={status?.gateway === 'online' ? 'default' : 'destructive'}>
                {status?.gateway ?? 'unknown'}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => restart.mutate()}
              disabled={restart.isPending}
            >
              {restart.isPending ? 'Restarting...' : 'Restart'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Telegram Bots</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{botToken ? botCount : '-'}</p>
            <p className="text-xs text-zinc-500">{botToken ? `${botCount} bot${botCount > 1 ? 's' : ''} configured` : 'No bot configured'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{agents?.length ?? '-'}</p>
            <p className="text-xs text-zinc-500">{totalUsers} users total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Default Model</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">{model}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500">Config Health</CardTitle>
            {!doctorLoading && doctorStatus && !doctorStatus.valid && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => doctorFix.mutate()}
                disabled={doctorFix.isPending}
              >
                {doctorFix.isPending ? 'Fixing...' : 'Auto Fix'}
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            ตรวจสอบว่า <span className="font-mono">openclaw.json</span> ถูกต้องตาม schema หรือไม่ —
            เช่น dmPolicy=open ต้องมี <span className="font-mono">&quot;*&quot;</span> ใน allowFrom,
            dmPolicy=allowlist ต้องมี user ID อย่างน้อย 1 คน
            ถ้า Config Invalid กด <span className="font-medium">Auto Fix</span> เพื่อให้ระบบซ่อมและ restart gateway อัตโนมัติ
          </p>
        </CardHeader>
        <CardContent>
          {doctorLoading ? (
            <p className="text-sm text-zinc-400">Checking...</p>
          ) : doctorStatus?.valid ? (
            <Badge variant="default" className="bg-green-600">Config Valid</Badge>
          ) : (
            <div className="space-y-2">
              <Badge variant="destructive">Config Invalid</Badge>
              {doctorStatus?.problems.map((p, i) => (
                <p key={i} className="text-xs text-red-500 font-mono">{p}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
