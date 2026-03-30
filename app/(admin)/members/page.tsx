import { getSession } from '@/lib/session'
import MembersContent from './members-content'

export default async function MembersPage() {
  const session = await getSession()
  return <MembersContent currentUserId={session?.userId ?? ''} />
}
