'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBusinessProfile,
  deleteBusinessProfile,
  getAgents,
  getBusinessProfiles,
  getBusinessProfileTemplates,
  linkBusinessProfileToAgent,
  unlinkBusinessProfileFromAgent,
  updateBusinessProfile,
  type BusinessProfile,
  type BusinessProfileTemplate,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, ExternalLink, Link2, Save, Trash2 } from 'lucide-react'

const SOUL_BLOCK_LIMIT = 1500
const SECRET_RE = /\b(api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|password|bot[_-]?token|token\s*[:=]|sk-[a-z0-9_-]+)\b/i

interface ProfileDraft {
  id?: string
  name: string
  nameTh: string
  businessType: string
  summary: string
  customerQuestionPatternsText: string
  mainCategoriesText: string
  synonymsText: string
  safetyRulesText: string
  soulBlock: string
}

type DiscardRequest =
  | { kind: 'newFromTemplate'; templateId?: string }
  | { kind: 'selectProfile'; profileId: string }
  | { kind: 'applyTemplate'; templateId: string }

function linesToText(lines?: string[]) {
  return (lines || []).join('\n')
}

function textToLines(text: string) {
  return text.split('\n').map(line => line.trim()).filter(Boolean)
}

function draftFromTemplate(template: BusinessProfileTemplate): ProfileDraft {
  return {
    name: template.name,
    nameTh: template.nameTh,
    businessType: template.businessType,
    summary: template.summary,
    customerQuestionPatternsText: linesToText(template.customerQuestionPatterns),
    mainCategoriesText: linesToText(template.mainCategories),
    synonymsText: linesToText(template.synonyms),
    safetyRulesText: linesToText(template.safetyRules),
    soulBlock: template.soulBlock,
  }
}

function draftFromProfile(profile: BusinessProfile): ProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    nameTh: profile.nameTh,
    businessType: profile.businessType,
    summary: profile.summary,
    customerQuestionPatternsText: linesToText(profile.customerQuestionPatterns),
    mainCategoriesText: linesToText(profile.mainCategories),
    synonymsText: linesToText(profile.synonyms),
    safetyRulesText: linesToText(profile.safetyRules),
    soulBlock: profile.soulBlock,
  }
}

function payloadFromDraft(draft: ProfileDraft) {
  return {
    name: draft.name.trim(),
    nameTh: draft.nameTh.trim(),
    businessType: draft.businessType.trim(),
    summary: draft.summary.trim(),
    customerQuestionPatterns: textToLines(draft.customerQuestionPatternsText),
    mainCategories: textToLines(draft.mainCategoriesText),
    synonyms: textToLines(draft.synonymsText),
    safetyRules: textToLines(draft.safetyRulesText),
    soulBlock: draft.soulBlock.trim(),
  }
}

function draftEqualsProfile(draft: ProfileDraft, profile: BusinessProfile | null) {
  if (!profile || draft.id !== profile.id) return false
  const payload = payloadFromDraft(draft)
  return payload.name === profile.name &&
    payload.nameTh === profile.nameTh &&
    payload.businessType === profile.businessType &&
    payload.summary === profile.summary &&
    payload.soulBlock === profile.soulBlock &&
    JSON.stringify(payload.customerQuestionPatterns) === JSON.stringify(profile.customerQuestionPatterns) &&
    JSON.stringify(payload.mainCategories) === JSON.stringify(profile.mainCategories) &&
    JSON.stringify(payload.synonyms) === JSON.stringify(profile.synonyms) &&
    JSON.stringify(payload.safetyRules) === JSON.stringify(profile.safetyRules)
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

export default function BusinessProfilesPage() {
  const qc = useQueryClient()
  const agentLinksRef = useRef<HTMLDivElement | null>(null)
  const [selectedId, setSelectedId] = useState<string>('new')
  const [draftState, setDraft] = useState<ProfileDraft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BusinessProfile | null>(null)
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest | null>(null)
  const [templateId, setTemplateId] = useState<string>('')
  const [lastLinkedAgentId, setLastLinkedAgentId] = useState<string | null>(null)

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['business-profiles'],
    queryFn: getBusinessProfiles,
  })
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['business-profile-templates'],
    queryFn: getBusinessProfileTemplates,
  })

  const selectedProfile = useMemo(
    () => profiles.find(profile => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  )

  const draft = useMemo(() => {
    if (draftState) return draftState
    if (selectedProfile) return draftFromProfile(selectedProfile)
    if (templates[0]) return draftFromTemplate(templates[0])
    return null
  }, [draftState, selectedProfile, templates])

  const validation = useMemo(() => {
    if (!draft) return ['ยังไม่มี profile draft']
    const issues: string[] = []
    const payload = payloadFromDraft(draft)
    if (!payload.name) issues.push('ต้องระบุชื่อภาษาอังกฤษ')
    if (!payload.nameTh) issues.push('ต้องระบุชื่อภาษาไทย')
    if (!payload.businessType) issues.push('ต้องระบุ business type')
    if (!payload.soulBlock) issues.push('ต้องระบุ SOUL block')
    if (payload.soulBlock.length > SOUL_BLOCK_LIMIT) issues.push(`SOUL block ต้องไม่เกิน ${SOUL_BLOCK_LIMIT} ตัวอักษร`)
    const rawText = [
      payload.name,
      payload.nameTh,
      payload.businessType,
      payload.summary,
      payload.soulBlock,
      ...payload.customerQuestionPatterns,
      ...payload.mainCategories,
      ...payload.synonyms,
      ...payload.safetyRules,
    ].join('\n')
    if (SECRET_RE.test(rawText)) issues.push('พบข้อความคล้าย secret/token/password ใน profile')
    return issues
  }, [draft])

  const dirty = useMemo(() => {
    if (!draft) return false
    if (!draft.id) return true
    return !draftEqualsProfile(draft, selectedProfile)
  }, [draft, selectedProfile])

  const hasUnsavedChanges = useMemo(() => {
    if (!draft) return false
    if (draft.id) return !draftEqualsProfile(draft, selectedProfile)
    return !!draftState
  }, [draft, draftState, selectedProfile])

  const activeProfileId = draft?.id ?? selectedProfile?.id
  const linkedAgents = selectedProfile?.agentIds ?? []
  const firstLinkedAgentId = lastLinkedAgentId || linkedAgents[0] || null
  const activeTemplateId = templateId || (!selectedProfile ? templates[0]?.templateId : '') || ''
  const activeTemplate = templates.find(template => template.templateId === activeTemplateId) ?? null
  const hasLinkedAgents = linkedAgents.length > 0
  const needsTemplateReload = !!draft?.id && hasLinkedAgents && hasUnsavedChanges
  const canSaveDraft = !!draft && validation.length === 0 && (!draft.id || dirty)

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
    enabled: !!activeProfileId,
  })

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('No draft')
      const payload = payloadFromDraft(draft)
      if (draft.id) return updateBusinessProfile(draft.id, payload)
      return createBusinessProfile(payload)
    },
    onSuccess: (profile) => {
      qc.setQueryData<BusinessProfile[]>(['business-profiles'], current => {
        const list = current ?? []
        const existing = list.find(item => item.id === profile.id)
        if (existing) {
          return list.map(item => item.id === profile.id ? { ...existing, ...profile } : item)
        }
        return [profile, ...list]
      })
      qc.invalidateQueries({ queryKey: ['business-profiles'] })
      setSelectedId(profile.id)
      setDraft(draftFromProfile(profile))
      toast.success('บันทึก Business Profile แล้ว')
      window.setTimeout(() => {
        agentLinksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'บันทึก Business Profile ไม่สำเร็จ'
      toast.error(message)
    },
  })

  const removeProfile = useMutation({
    mutationFn: (profileId: string) => deleteBusinessProfile(profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-profiles'] })
      setSelectedId('new')
      const first = templates[0]
      setDraft(first ? draftFromTemplate(first) : null)
      setDeleteTarget(null)
      toast.success('ลบ Business Profile แล้ว')
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'ลบ Business Profile ไม่สำเร็จ'
      toast.error(message)
    },
  })

  const linkAgent = useMutation({
    mutationFn: async ({ profileId, agentId, linked }: { profileId: string; agentId: string; linked: boolean }) => {
      if (linked) await unlinkBusinessProfileFromAgent(profileId, agentId)
      else await linkBusinessProfileToAgent(profileId, agentId)
    },
    onSuccess: (_data, variables) => {
      qc.setQueryData<BusinessProfile[]>(['business-profiles'], current => {
        return (current ?? []).map(profile => {
          if (profile.id !== variables.profileId) return profile
          const ids = new Set(profile.agentIds ?? [])
          if (variables.linked) ids.delete(variables.agentId)
          else ids.add(variables.agentId)
          return { ...profile, agentIds: Array.from(ids) }
        })
      })
      qc.invalidateQueries({ queryKey: ['business-profiles'] })
      setLastLinkedAgentId(variables.linked ? null : variables.agentId)
      toast.success(variables.linked ? 'ยกเลิกการผูก agent แล้ว' : 'ผูก agent แล้ว')
    },
    onError: () => toast.error('อัปเดต agent link ไม่สำเร็จ'),
  })

  function runDiscardableAction(request: DiscardRequest) {
    if (hasUnsavedChanges) {
      setDiscardRequest(request)
      return
    }
    executeDiscardableAction(request)
  }

  function startNewFromTemplate(id = templates[0]?.templateId) {
    if (!id) return
    runDiscardableAction({ kind: 'newFromTemplate', templateId: id })
  }

  function executeDiscardableAction(request: DiscardRequest) {
    if (request.kind === 'selectProfile') {
      const profile = profiles.find(item => item.id === request.profileId)
      if (!profile) return
      setSelectedId(profile.id)
      setTemplateId('')
      setDraft(draftFromProfile(profile))
      setLastLinkedAgentId(null)
      setDiscardRequest(null)
      return
    }

    const id = request.templateId || templates[0]?.templateId
    if (!id) return
    const template = templates.find(item => item.templateId === id)
    if (!template) return

    if (request.kind === 'newFromTemplate') {
      setSelectedId('new')
      setTemplateId(id)
      setDraft(draftFromTemplate(template))
      setLastLinkedAgentId(null)
      setDiscardRequest(null)
      return
    }

    if (request.kind === 'applyTemplate') {
      setTemplateId(id)
      setSelectedId('new')
      setDraft(draftFromTemplate(template))
      setDiscardRequest(null)
    }
  }

  function selectProfile(profile: BusinessProfile) {
    runDiscardableAction({ kind: 'selectProfile', profileId: profile.id })
  }

  function applyTemplate(id: string) {
    runDiscardableAction({ kind: 'applyTemplate', templateId: id })
  }

  const soulChars = draft?.soulBlock.length ?? 0
  const saveDisabled = saveProfile.isPending || !canSaveDraft

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Profiles</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            กำหนดบริบทประเภทธุรกิจแบบสั้นให้ agent แล้วนำไปใช้ตอน Load Template
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => startNewFromTemplate()}
        >
          สร้าง Profile ใหม่
        </Button>
      </div>

      <SetupStatusPanel
        activeProfileId={activeProfileId}
        canSave={canSaveDraft}
        dirty={hasUnsavedChanges}
        firstLinkedAgentId={firstLinkedAgentId}
        hasLinkedAgents={hasLinkedAgents}
        needsTemplateReload={needsTemplateReload}
        onPrimaryAction={() => {
          if (canSaveDraft) {
            saveProfile.mutate()
            return
          }
          if (activeProfileId && (!hasLinkedAgents || needsTemplateReload)) {
            agentLinksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }}
        saving={saveProfile.isPending}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-0 xl:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profiles</CardTitle>
            <p className="text-xs text-zinc-500">เลือก profile ที่ต้องการแก้ไข หรือเริ่มจาก template ทางการ</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Button
                variant={selectedId === 'new' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => startNewFromTemplate()}
              >
                สร้างจาก Template
              </Button>
              {profilesLoading && <ProfileListSkeleton />}
              {!profilesLoading && profiles.length === 0 && (
                <ProfileEmptyState />
              )}
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {profiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => selectProfile(profile)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      selectedId === profile.id
                        ? 'border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{profile.nameTh}</p>
                    <p className="truncate text-xs text-zinc-500">{profile.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(profile.agentIds || []).map(agentId => (
                        <Badge key={agentId} variant="secondary" className="text-[10px]">{agentId}</Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">เลือกประเภทธุรกิจ</CardTitle>
                  <p className="text-xs text-zinc-500">Template เป็นค่าเริ่มต้น แก้ไขให้เข้ากับธุรกิจจริงได้</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={activeTemplateId}
                    onValueChange={value => { if (value) applyTemplate(value) }}
                    disabled={templatesLoading}
                  >
                    <SelectTrigger aria-label="เลือกประเภทธุรกิจจาก template" className="w-full sm:w-80">
                      <span className="truncate text-left">{activeTemplate?.nameTh || 'เลือก Template'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.templateId} value={template.templateId}>
                          {template.nameTh}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draft?.id && (
                    <Button variant="outline" className="text-red-600" onClick={() => selectedProfile && setDeleteTarget(selectedProfile)}>
                      <Trash2 className="mr-2 size-4" />
                      ลบ
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="business-profile-name">ชื่อทางการ</Label>
                  <Input id="business-profile-name" value={draft?.name || ''} onChange={e => draft && setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-profile-name-th">ชื่อภาษาไทย</Label>
                  <Input id="business-profile-name-th" value={draft?.nameTh || ''} onChange={e => draft && setDraft({ ...draft, nameTh: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-profile-type">รหัสประเภท</Label>
                  <Input id="business-profile-type" className="font-mono" value={draft?.businessType || ''} onChange={e => draft && setDraft({ ...draft, businessType: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-profile-summary">สรุปธุรกิจ</Label>
                  <Input id="business-profile-summary" value={draft?.summary || ''} onChange={e => draft && setDraft({ ...draft, summary: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <FieldTextarea
                  id="business-profile-question-patterns"
                  label="รูปแบบคำถามลูกค้า"
                  value={draft?.customerQuestionPatternsText || ''}
                  onChange={value => draft && setDraft({ ...draft, customerQuestionPatternsText: value })}
                />
                <FieldTextarea
                  id="business-profile-main-categories"
                  label="หมวดสินค้า/บริการหลัก"
                  value={draft?.mainCategoriesText || ''}
                  onChange={value => draft && setDraft({ ...draft, mainCategoriesText: value })}
                />
                <FieldTextarea
                  id="business-profile-synonyms"
                  label="คำพ้อง/คำที่มักใช้"
                  value={draft?.synonymsText || ''}
                  onChange={value => draft && setDraft({ ...draft, synonymsText: value })}
                />
                <FieldTextarea
                  id="business-profile-safety-rules"
                  label="กติกาความปลอดภัย"
                  value={draft?.safetyRulesText || ''}
                  onChange={value => draft && setDraft({ ...draft, safetyRulesText: value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">ข้อความที่จะเพิ่มเข้า Agent</CardTitle>
                  <p className="text-xs text-zinc-500">ส่วนนี้จะถูกเพิ่มตอนกด Load Template ในหน้า Agent</p>
                </div>
                <Badge variant={soulChars > SOUL_BLOCK_LIMIT ? 'destructive' : 'secondary'}>
                  {soulChars}/{SOUL_BLOCK_LIMIT} ตัวอักษร
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="business-profile-soul-block" className="sr-only">ข้อความที่จะเพิ่มเข้า Agent</Label>
              <Textarea
                id="business-profile-soul-block"
                value={draft?.soulBlock || ''}
                onChange={e => draft && setDraft({ ...draft, soulBlock: e.target.value })}
                className="min-h-[260px] font-mono text-xs"
              />
              {validation.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">ยังบันทึกไม่ได้</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {validation.map(issue => <li key={issue}>{issue}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  <CheckCircle2 className="size-4" />
                  พร้อมบันทึก และอยู่ในความยาวที่กำหนด
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  {draft?.id ? `แก้ไขล่าสุด: ${formatDate(selectedProfile?.updatedAt)}` : 'Profile ใหม่จะยังไม่ผูกกับ agent จนกว่าจะบันทึกก่อน'}
                </p>
                <Button onClick={() => saveProfile.mutate()} disabled={saveDisabled}>
                  <Save className="mr-2 size-4" />
                  {saveProfile.isPending ? 'กำลังบันทึก...' : draft?.id ? 'บันทึกการแก้ไข' : 'สร้าง Profile'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div ref={agentLinksRef}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Agent Links</CardTitle>
                <p className="text-xs text-zinc-500">ผูก profile กับ agent แล้วไปหน้า Agent เพื่อ Load Template และ Save SOUL</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!activeProfileId && (
                  <div className="rounded-md border bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-900">
                    ต้องสร้าง profile ก่อน จึงจะผูกกับ agent ได้
                  </div>
                )}
                {activeProfileId && (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {agentsLoading && (
                      <div className="rounded-md border bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-900">
                        กำลังโหลด agent...
                      </div>
                    )}
                    {!agentsLoading && agents.map(agent => {
                      const linked = linkedAgents.includes(agent.id)
                      return (
                        <AgentLinkCard
                          key={agent.id}
                          agentId={agent.id}
                          disabled={linkAgent.isPending}
                          linked={linked}
                          onToggle={() => linkAgent.mutate({ profileId: activeProfileId, agentId: agent.id, linked })}
                          workspace={agent.workspace}
                        />
                      )
                    })}
                  </div>
                )}
                {activeProfileId && linkedAgents.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    หลังแก้ไข profile ให้เปิดหน้า Agent แล้วกด Load Template เพื่อใช้ข้อความล่าสุด
                    <div className="mt-3 flex flex-wrap gap-2">
                      {linkedAgents.map(agentId => (
                        <Link
                          key={agentId}
                          href={`/agents/${encodeURIComponent(agentId)}`}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-background')}
                        >
                          <ExternalLink className="mr-1.5 size-3.5" />
                          เปิด Agent {agentId}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <TechnicalDetails
                  activeTemplate={activeTemplate}
                  activeTemplateId={activeTemplateId}
                  draft={draft}
                  selectedProfile={selectedProfile}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ Business Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              ต้องการลบ <span className="font-medium text-zinc-900 dark:text-zinc-100">{deleteTarget?.nameTh}</span> ใช่ไหม?
            </p>
            {!!deleteTarget?.agentIds?.length && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Profile นี้ยังผูกกับ agent: {deleteTarget.agentIds.join(', ')} กรุณา unlink ก่อนลบ
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={removeProfile.isPending || !!deleteTarget?.agentIds?.length}
              onClick={() => deleteTarget && removeProfile.mutate(deleteTarget.id)}
            >
              <Trash2 className="mr-2 size-4" />
              ลบ Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!discardRequest} onOpenChange={open => { if (!open) setDiscardRequest(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ทิ้งการแก้ไขที่ยังไม่ได้บันทึก?</DialogTitle>
            <DialogDescription>
              มีข้อมูล Business Profile ที่แก้ไขค้างไว้ ถ้าไปต่อ ระบบจะเปลี่ยน profile/template และ draft ปัจจุบันจะหายไป
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardRequest(null)}>
              กลับไปแก้ต่อ
            </Button>
            <Button
              variant="destructive"
              onClick={() => discardRequest && executeDiscardableAction(discardRequest)}
            >
              ทิ้งการแก้ไข
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SetupStatusPanel({
  activeProfileId,
  canSave,
  dirty,
  firstLinkedAgentId,
  hasLinkedAgents,
  needsTemplateReload,
  onPrimaryAction,
  saving,
}: {
  activeProfileId?: string
  canSave: boolean
  dirty: boolean
  firstLinkedAgentId: string | null
  hasLinkedAgents: boolean
  needsTemplateReload: boolean
  onPrimaryAction: () => void
  saving: boolean
}) {
  const steps = [
    { label: 'เลือก Template', done: true },
    { label: 'บันทึก Profile', done: !!activeProfileId && !dirty },
    { label: 'ผูก Agent', done: hasLinkedAgents },
    { label: 'Load Template', done: hasLinkedAgents && !needsTemplateReload },
  ]

  let title = 'สร้าง Business Profile'
  let description = 'ตรวจข้อความด้านล่าง แล้วกดสร้าง Profile เพื่อเริ่มผูกกับ agent'
  let actionLabel = 'สร้าง Profile'
  let actionHref: string | null = null
  let disabled = !canSave || saving

  if (activeProfileId && !hasLinkedAgents) {
    if (dirty) {
      title = 'บันทึกการแก้ไขก่อนผูก Agent'
      description = 'บันทึก Profile ล่าสุดก่อนเลือก agent ที่ต้องใช้บริบทนี้'
      actionLabel = 'บันทึกการแก้ไข'
      disabled = !canSave || saving
    } else {
      title = 'ผูก Profile กับ Agent'
      description = 'เลือก agent ที่ต้องใช้บริบทประเภทธุรกิจนี้'
      actionLabel = 'ไปที่ Agent Links'
      disabled = false
    }
  } else if (activeProfileId && needsTemplateReload) {
    title = 'มีการแก้ไขที่ยังไม่ได้ใช้กับ Agent'
    description = 'บันทึกการแก้ไข แล้วเปิดหน้า Agent เพื่อกด Load Template ใหม่'
    actionLabel = canSave ? 'บันทึกการแก้ไข' : 'ไปที่ Agent Links'
    disabled = saving || (canSave ? false : false)
  } else if (activeProfileId && hasLinkedAgents) {
    title = 'พร้อมไป Load Template'
    description = 'เปิดหน้า Agent ที่ผูกไว้ แล้วกด Load Template เพื่อใช้ Business Profile นี้'
    actionLabel = 'เปิดหน้า Agent'
    actionHref = firstLinkedAgentId ? `/agents/${encodeURIComponent(firstLinkedAgentId)}` : null
    disabled = !actionHref
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={needsTemplateReload ? 'destructive' : 'secondary'}>
                {needsTemplateReload ? 'ต้อง Load Template ใหม่' : activeProfileId ? 'มี Profile แล้ว' : 'เริ่มตั้งค่า'}
              </Badge>
              <h2 className="text-base font-semibold">{title}</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.label} className="flex items-center gap-2 rounded-md border bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                <span className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  step.done ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                )}>
                  {step.done ? <CheckCircle2 className="size-3.5" /> : index + 1}
                </span>
                <span className={cn(step.done ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-500')}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
        {actionHref ? (
          <Link className={cn(buttonVariants({ variant: 'default' }), 'w-full sm:w-auto')} href={actionHref}>
            {actionLabel}
            <ArrowRight className="ml-1.5 size-4" />
          </Link>
        ) : (
          <Button className="w-full sm:w-auto" disabled={disabled} onClick={onPrimaryAction}>
            {saving ? 'กำลังบันทึก...' : actionLabel}
            <ArrowRight className="ml-1.5 size-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ProfileListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-14 rounded-md bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-14 rounded-md bg-zinc-100 dark:bg-zinc-900" />
    </div>
  )
}

function ProfileEmptyState() {
  return (
    <div className="rounded-md border bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-900">
      ยังไม่มี Business Profile ที่บันทึกไว้ เลือก template ด้านขวาแล้วกดสร้าง Profile เพื่อเริ่มใช้งาน
    </div>
  )
}

function AgentLinkCard({
  agentId,
  disabled,
  linked,
  onToggle,
  workspace,
}: {
  agentId: string
  disabled: boolean
  linked: boolean
  onToggle: () => void
  workspace: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-medium">{agentId}</p>
        <p className="truncate text-xs text-zinc-500">{workspace}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {linked && (
          <Link href={`/agents/${encodeURIComponent(agentId)}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-background')}>
            <ExternalLink className="mr-1.5 size-3.5" />
            เปิด Agent
          </Link>
        )}
        <Button
          variant={linked ? 'default' : 'outline'}
          size="sm"
          disabled={disabled}
          onClick={onToggle}
        >
          <Link2 className="mr-1.5 size-3.5" />
          {linked ? 'Linked' : 'Link'}
        </Button>
      </div>
    </div>
  )
}

function TechnicalDetails({
  activeTemplate,
  activeTemplateId,
  draft,
  selectedProfile,
}: {
  activeTemplate: BusinessProfileTemplate | null
  activeTemplateId: string
  draft: ProfileDraft | null
  selectedProfile: BusinessProfile | null
}) {
  return (
    <details className="rounded-md border bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      <summary className="cursor-pointer font-medium">รายละเอียดสำหรับทีมเทคนิค</summary>
      <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <div>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Template slug:</span> {activeTemplateId || '-'}
        </div>
        <div>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Template:</span> {activeTemplate?.name || '-'}
        </div>
        <div>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Profile id:</span> {draft?.id || selectedProfile?.id || '-'}
        </div>
        <div>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Business type:</span> {draft?.businessType || '-'}
        </div>
        <div className="sm:col-span-2">
          ข้อความนี้เป็น prompt context สำหรับ SOUL เท่านั้น ไม่เขียนค่าเข้า openclaw.json
        </div>
      </div>
    </details>
  )
}

function FieldTextarea({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label={`คัดลอก ${label}`}
          title={`คัดลอก ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(value)
            toast.success('คัดลอกแล้ว')
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
      <Textarea id={id} value={value} onChange={e => onChange(e.target.value)} className="min-h-[120px] text-sm" />
      <p className="text-xs text-zinc-400">หนึ่งบรรทัดต่อหนึ่งรายการ เก็บเป็นรายละเอียดของ profile แต่ไม่เพิ่มทั้งหมดเข้า Agent</p>
    </div>
  )
}
