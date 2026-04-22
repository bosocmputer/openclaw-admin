'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { getSaleOrders, type SaleOrder } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PAGE_SIZE = 50

function statusBadge(status: SaleOrder['status']) {
  if (status === 'success') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">สำเร็จ</Badge>
  if (status === 'failed')  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">ล้มเหลว</Badge>
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">รอดำเนินการ</Badge>
}

function sourceLabel(source: string) {
  if (source === 'line')   return 'LINE OA'
  if (source === 'email')  return 'Email'
  if (source === 'manual') return 'Manual'
  return source
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function formatAmount(amount: string | null) {
  if (!amount) return '—'
  return Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })
}

function itemsSummary(items: SaleOrder['items']) {
  if (!Array.isArray(items) || items.length === 0) return '—'
  if (items.length === 1) return `${items[0].item_code} ×${items[0].qty}`
  return `${items.length} รายการ`
}

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sale-orders', statusFilter, page],
    queryFn: () => getSaleOrders({
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    refetchInterval: 30_000,
  })

  const orders = data?.orders ?? []
  const total  = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">คำสั่งซื้อ</h1>
          <p className="text-sm text-zinc-500 mt-0.5">รายการคำสั่งซื้อที่ AI สร้างผ่านระบบ</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0) }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="สถานะทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="pending">รอดำเนินการ</SelectItem>
              <SelectItem value="success">สำเร็จ</SelectItem>
              <SelectItem value="failed">ล้มเหลว</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-zinc-500 py-8 text-center">กำลังโหลด...</div>
      )}

      {isError && (
        <div className="text-sm text-red-500 py-8 text-center">โหลดข้อมูลไม่สำเร็จ</div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">วันที่</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">เลขบิล</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">ลูกค้า</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">เบอร์</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">รายการ</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">ยอดรวม</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Agent</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">ช่องทาง</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">ไม่มีข้อมูล</td>
                  </tr>
                ) : (
                  orders.map(order => (
                    <tr key={order.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-500 text-xs">{formatDate(order.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/orders/${order.id}`} className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          {order.doc_no || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 max-w-[150px] truncate">{order.contact_name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{order.contact_phone || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{itemsSummary(order.items)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">{formatAmount(order.total_amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-500">{order.agent_id || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-500">{sourceLabel(order.source)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/orders/${order.id}`}>{statusBadge(order.status)}</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>แสดง {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} จาก {total} รายการ</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  ก่อนหน้า
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  ถัดไป
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
