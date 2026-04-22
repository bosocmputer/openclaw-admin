'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSaleOrder, resendSaleOrder, type SaleOrderItem } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function statusBadge(status: string) {
  if (status === 'success') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">สำเร็จ</Badge>
  if (status === 'failed')  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">ล้มเหลว</Badge>
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">รอดำเนินการ</Badge>
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

function formatAmount(amount: string | null) {
  if (!amount) return '—'
  return Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) + ' บาท'
}

function sourceLabel(source: string) {
  if (source === 'line')   return 'LINE OA'
  if (source === 'email')  return 'Email'
  if (source === 'manual') return 'Manual'
  return source
}

function JsonBlock({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false)
  if (!data) return <span className="text-zinc-400 text-sm">—</span>
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        {open ? 'ซ่อน' : 'ดู JSON'}
      </button>
      {open && (
        <pre className="mt-2 p-3 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs overflow-x-auto max-h-72 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['sale-order', id],
    queryFn: () => getSaleOrder(id),
  })

  const resendMutation = useMutation({
    mutationFn: () => resendSaleOrder(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['sale-order', id] })
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      if (result.success) {
        toast.success(`ส่งซ้ำสำเร็จ — ${result.doc_no}`)
      } else {
        toast.error(`ส่งซ้ำไม่สำเร็จ: ${result.error}`)
      }
    },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  })

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">กำลังโหลด...</div>
  if (isError || !order) return <div className="p-6 text-sm text-red-500">โหลดข้อมูลไม่สำเร็จ</div>

  const items: SaleOrderItem[] = Array.isArray(order.items) ? order.items : []

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/orders" className="text-sm text-zinc-400 hover:text-zinc-600">คำสั่งซื้อ</Link>
            <span className="text-zinc-300">/</span>
            <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
              {order.doc_no || order.id.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold font-mono">{order.doc_no || '(ยังไม่มีเลขบิล)'}</h1>
            {statusBadge(order.status)}
            {order.retry_count > 0 && (
              <span className="text-xs text-zinc-400">ส่งซ้ำ {order.retry_count} ครั้ง</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {order.status === 'failed' && (
            <Button
              size="sm"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? 'กำลังส่ง...' : 'ส่งซ้ำ'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push('/orders')}>
            กลับ
          </Button>
        </div>
      </div>

      {/* ข้อมูลออเดอร์ */}
      <div className="rounded-lg border p-4 space-y-0">
        <Row label="วันที่สร้าง">{formatDate(order.created_at)}</Row>
        <Row label="อัพเดทล่าสุด">{formatDate(order.updated_at)}</Row>
        <Row label="สถานะ">{statusBadge(order.status)}</Row>
        {order.error_message && (
          <Row label="ข้อผิดพลาด">
            <span className="text-red-500">{order.error_message}</span>
          </Row>
        )}
        <Row label="ช่องทาง">{sourceLabel(order.source)}</Row>
        <Row label="Agent">{order.agent_id || '—'}</Row>
      </div>

      {/* ข้อมูลลูกค้า */}
      <div className="rounded-lg border p-4 space-y-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">ลูกค้า</p>
        <Row label="ชื่อ">{order.contact_name || '—'}</Row>
        <Row label="เบอร์โทร">
          <span className="font-mono">{order.contact_phone || '—'}</span>
        </Row>
      </div>

      {/* รายการสินค้า */}
      <div className="rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">รายการสินค้า</p>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">ไม่มีรายการ</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left py-2 font-medium text-zinc-500">รหัสสินค้า</th>
                <th className="text-right py-2 font-medium text-zinc-500">จำนวน</th>
                <th className="text-left py-2 font-medium text-zinc-500">หน่วย</th>
                <th className="text-right py-2 font-medium text-zinc-500">ราคา/หน่วย</th>
                <th className="text-right py-2 font-medium text-zinc-500">รวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="py-2 font-mono text-xs">{item.item_code}</td>
                  <td className="py-2 text-right tabular-nums">{item.qty}</td>
                  <td className="py-2 pl-2 text-zinc-500">{item.unit_code}</td>
                  <td className="py-2 text-right tabular-nums">{Number(item.price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right tabular-nums">{(item.qty * item.price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <td colSpan={4} className="py-2 text-right font-semibold">ยอดรวม</td>
                <td className="py-2 text-right font-semibold tabular-nums">{formatAmount(order.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Raw data */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Raw Data</p>
        <div className="flex gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
          <span className="w-36 shrink-0 text-sm text-zinc-500">Request</span>
          <div className="flex-1"><JsonBlock data={order.raw_request} /></div>
        </div>
        <div className="flex gap-4 py-2">
          <span className="w-36 shrink-0 text-sm text-zinc-500">Response</span>
          <div className="flex-1"><JsonBlock data={order.raw_response} /></div>
        </div>
      </div>
    </div>
  )
}
