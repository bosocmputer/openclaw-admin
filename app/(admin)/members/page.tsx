'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { apiClient } from '@/lib/api'

interface Member {
  id: string
  username: string
  role: string
  display_name: string
  is_active: boolean
  created_at: string
}

async function getMembers(): Promise<Member[]> {
  const res = await apiClient.get('/api/members')
  return res.data
}

async function createMember(data: { username: string; password: string; role: string; display_name: string }) {
  const res = await apiClient.post('/api/members', data)
  return res.data
}

async function updateMember(id: string, data: Partial<{ role: string; display_name: string; is_active: boolean; password: string }>) {
  const res = await apiClient.patch(`/api/members/${id}`, data)
  return res.data
}

async function deleteMember(id: string) {
  const res = await apiClient.delete(`/api/members/${id}`)
  return res.data
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
}

export default function MembersPage() {
  const qc = useQueryClient()
  const [addDialog, setAddDialog] = useState(false)
  const [resetDialog, setResetDialog] = useState<Member | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRole, setNewRole] = useState('admin')
  const [newResetPassword, setNewResetPassword] = useState('')

  const { data: members = [], isLoading } = useQuery({ queryKey: ['members'], queryFn: getMembers })

  const createMutation = useMutation({
    mutationFn: createMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      toast.success('เพิ่มสมาชิกสำเร็จ')
      setAddDialog(false)
      setNewUsername('')
      setNewPassword('')
      setNewDisplayName('')
      setNewRole('admin')
    },
    onError: (e: Error) => toast.error(e.message || 'เพิ่มสมาชิกไม่สำเร็จ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateMember>[1] }) =>
      updateMember(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      toast.success('บันทึกสำเร็จ')
    },
    onError: () => toast.error('บันทึกไม่สำเร็จ'),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      updateMember(id, { password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      toast.success('Reset รหัสผ่านสำเร็จ')
      setResetDialog(null)
      setNewResetPassword('')
    },
    onError: () => toast.error('Reset รหัสผ่านไม่สำเร็จ'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      toast.success('ลบสมาชิกสำเร็จ')
    },
    onError: () => toast.error('ลบสมาชิกไม่สำเร็จ'),
  })

  if (isLoading) return <p className="text-sm text-zinc-400">Loading...</p>

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">สมาชิก</h1>
          <p className="text-sm text-zinc-500 mt-1">จัดการผู้ใช้งานระบบ Admin</p>
        </div>
        <Button onClick={() => setAddDialog(true)}>เพิ่มสมาชิก</Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {members.map(m => (
          <Card key={m.id}>
            <CardHeader>
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-base">{m.display_name || m.username}</CardTitle>
                <span className="text-sm text-zinc-500 font-mono">{m.username}</span>
                <Badge variant={m.role === 'superadmin' ? 'default' : 'secondary'} className="text-xs">
                  {ROLE_LABELS[m.role] ?? m.role}
                </Badge>
                {!m.is_active && <Badge variant="destructive" className="text-xs">Disabled</Badge>}
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setResetDialog(m)}
                  >
                    Reset Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: m.id, data: { is_active: !m.is_active } })}
                  >
                    {m.is_active ? 'Disable' : 'Enable'}
                  </Button>
                  {m.role !== 'superadmin' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(m.id)}
                    >
                      ลบ
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-500">Role:</span>
                <Select
                  value={m.role}
                  onValueChange={v => v && updateMutation.mutate({ id: m.id, data: { role: v } })}
                  disabled={m.role === 'superadmin'}
                >
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มสมาชิกใหม่</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">ชื่อผู้ใช้</label>
              <Input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ชื่อที่แสดง</label>
              <Input
                value={newDisplayName}
                onChange={e => setNewDisplayName(e.target.value)}
                placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">รหัสผ่าน</label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="รหัสผ่านเริ่มต้น"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Role</label>
              <Select value={newRole} onValueChange={v => v && setNewRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>ยกเลิก</Button>
            <Button
              disabled={!newUsername.trim() || !newPassword.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({
                username: newUsername.trim(),
                password: newPassword,
                role: newRole,
                display_name: newDisplayName.trim(),
              })}
            >
              {createMutation.isPending ? 'กำลังเพิ่ม...' : 'เพิ่มสมาชิก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetDialog} onOpenChange={open => { if (!open) { setResetDialog(null); setNewResetPassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset รหัสผ่าน — {resetDialog?.display_name || resetDialog?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <label className="text-sm font-medium">รหัสผ่านใหม่</label>
            <Input
              type="password"
              value={newResetPassword}
              onChange={e => setNewResetPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetDialog(null); setNewResetPassword('') }}>ยกเลิก</Button>
            <Button
              disabled={!newResetPassword.trim() || resetPasswordMutation.isPending}
              onClick={() => {
                if (resetDialog) {
                  resetPasswordMutation.mutate({ id: resetDialog.id, password: newResetPassword })
                }
              }}
            >
              {resetPasswordMutation.isPending ? 'กำลัง Reset...' : 'Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
