import Sidebar from '@/components/sidebar'
import QueryProvider from '@/components/query-provider'
import { Toaster } from '@/components/ui/sonner'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const isChat = session.role === 'chat'

  return (
    <div className="h-screen flex overflow-hidden">
      <QueryProvider>
        {!isChat && <Sidebar role={session.role} username={session.username} displayName={session.displayName} />}
        <main className={`flex-1 overflow-y-auto min-w-0 ${isChat ? '' : 'p-6'}`}>{children}</main>
        <Toaster />
      </QueryProvider>
    </div>
  )
}
