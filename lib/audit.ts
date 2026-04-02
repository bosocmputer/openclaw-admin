import sql from '@/lib/db'

export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'member.create' | 'member.update' | 'member.delete'
  | 'agent.soul.update' | 'agent.mcp.update' | 'agent.user.add' | 'agent.user.remove'
  | 'config.update'
  | 'telegram.account.add' | 'telegram.account.delete' | 'telegram.binding.update'
  | 'webchat.room.create' | 'webchat.room.update' | 'webchat.room.delete'
  | 'gateway.restart'

export async function audit(params: {
  actor: string       // username
  action: AuditAction
  target?: string     // e.g. agentId, memberId
  detail?: string     // short human-readable note
  ip?: string
}) {
  try {
    await sql`
      INSERT INTO audit_logs (actor, action, target, detail, ip)
      VALUES (${params.actor}, ${params.action}, ${params.target ?? null}, ${params.detail ?? null}, ${params.ip ?? null})
    `
  } catch (e) {
    // audit failure must never break the main flow
    console.error('[audit] failed to write log', { ...params, error: e instanceof Error ? e.message : String(e) })
  }
}
