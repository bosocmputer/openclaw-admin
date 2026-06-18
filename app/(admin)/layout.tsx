import Sidebar from '@/components/sidebar'
import Breadcrumb from '@/components/breadcrumb'
import QueryProvider from '@/components/query-provider'
import { Toaster } from '@/components/ui/sonner'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const isChat = session.role === 'chat'

  return (
    <div className="flex h-screen overflow-hidden">
      <QueryProvider>
        {!isChat && (
          <div className="hidden lg:flex">
            <Sidebar role={session.role} username={session.username} displayName={session.displayName} />
          </div>
        )}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!isChat && (
            <header className="shrink-0 border-b bg-white px-4 py-3 dark:bg-zinc-950 sm:px-6">
              <Breadcrumb />
            </header>
          )}
          <div className={`flex-1 ${isChat ? 'overflow-hidden' : 'overflow-y-auto p-4 sm:p-6'}`}>
            {children}
          </div>
        </main>
        <Toaster />
      </QueryProvider>
    </div>
  )
}
