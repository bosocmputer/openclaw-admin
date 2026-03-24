import { getSession } from '@/lib/session'
import WebchatClient from './webchat-client'

export default async function WebchatPage() {
  const session = await getSession()
  return (
    <WebchatClient
      username={session?.username ?? ''}
      role={session?.role ?? 'chat'}
    />
  )
}
