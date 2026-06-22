'use client'

import { useMemo, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Copy, Link2, Save, Trash2 } from 'lucide-react'

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
  const [selectedId, setSelectedId] = useState<string>('new')
  const [draftState, setDraft] = useState<ProfileDraft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BusinessProfile | null>(null)
  const [templateId, setTemplateId] = useState<string>('')

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['business-profiles'],
    queryFn: getBusinessProfiles,
  })
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['business-profile-templates'],
    queryFn: getBusinessProfileTemplates,
  })
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
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

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('No draft')
      const payload = payloadFromDraft(draft)
      if (draft.id) return updateBusinessProfile(draft.id, payload)
      return createBusinessProfile(payload)
    },
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: ['business-profiles'] })
      setSelectedId(profile.id)
      setDraft(draftFromProfile(profile))
      toast.success('บันทึก Business Profile แล้ว')
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-profiles'] })
      toast.success('อัปเดต agent link แล้ว')
    },
    onError: () => toast.error('อัปเดต agent link ไม่สำเร็จ'),
  })

  function applyTemplate(id: string) {
    const template = templates.find(item => item.templateId === id)
    if (!template) return
    setTemplateId(id)
    setSelectedId('new')
    setDraft(draftFromTemplate(template))
  }

  const soulChars = draft?.soulBlock.length ?? 0
  const activeProfileId = draft?.id ?? selectedProfile?.id
  const linkedAgents = selectedProfile?.agentIds ?? []

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Profiles</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            กำหนดบริบทประเภทธุรกิจแบบสั้นสำหรับ agent แล้วใช้ในขั้นตอน Load Template ของ SOUL โดยไม่แก้ openclaw.json
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setSelectedId('new')
            if (templates[0]) {
              setTemplateId(templates[0].templateId)
              setDraft(draftFromTemplate(templates[0]))
            }
          }}
        >
          สร้าง Profile ใหม่
        </Button>
      </div>

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
                onClick={() => {
                  setSelectedId('new')
                  if (templates[0]) {
                    setTemplateId(templates[0].templateId)
                    setDraft(draftFromTemplate(templates[0]))
                  }
                }}
              >
                + New from Template
              </Button>
              {profilesLoading && <p className="text-sm text-zinc-400">กำลังโหลด profiles...</p>}
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {profiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(profile.id)
                      setDraft(draftFromProfile(profile))
                    }}
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

            <div className="rounded-md border bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <p className="font-medium text-zinc-800 dark:text-zinc-200">Data flow</p>
              <p className="mt-1">1. สร้าง Business Profile</p>
              <p>2. ผูกกับ agent</p>
              <p>3. เข้า Agent แล้วกด Load Template</p>
              <p>4. Preview แล้ว Save SOUL</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Template & Identity</CardTitle>
                  <p className="text-xs text-zinc-500">Template เป็นค่าเริ่มต้น แก้ไขให้เข้ากับธุรกิจจริงได้</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={templateId || templates[0]?.templateId || ''}
                    onValueChange={value => { if (value) applyTemplate(value) }}
                    disabled={templatesLoading}
                  >
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue placeholder="เลือก template" />
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
                  <Label>ชื่อทางการ</Label>
                  <Input value={draft?.name || ''} onChange={e => draft && setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>ชื่อภาษาไทย</Label>
                  <Input value={draft?.nameTh || ''} onChange={e => draft && setDraft({ ...draft, nameTh: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Business Type</Label>
                  <Input className="font-mono" value={draft?.businessType || ''} onChange={e => draft && setDraft({ ...draft, businessType: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Summary</Label>
                  <Input value={draft?.summary || ''} onChange={e => draft && setDraft({ ...draft, summary: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <FieldTextarea
                  label="Customer Question Patterns"
                  value={draft?.customerQuestionPatternsText || ''}
                  onChange={value => draft && setDraft({ ...draft, customerQuestionPatternsText: value })}
                />
                <FieldTextarea
                  label="Main Categories"
                  value={draft?.mainCategoriesText || ''}
                  onChange={value => draft && setDraft({ ...draft, mainCategoriesText: value })}
                />
                <FieldTextarea
                  label="Synonyms / Common Terms"
                  value={draft?.synonymsText || ''}
                  onChange={value => draft && setDraft({ ...draft, synonymsText: value })}
                />
                <FieldTextarea
                  label="Safety Rules"
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
                  <CardTitle className="text-base">SOUL Block Preview</CardTitle>
                  <p className="text-xs text-zinc-500">ส่วนนี้เท่านั้นที่จะถูก inject เข้า SOUL เมื่อ Load Template</p>
                </div>
                <Badge variant={soulChars > SOUL_BLOCK_LIMIT ? 'destructive' : 'secondary'}>
                  {soulChars}/{SOUL_BLOCK_LIMIT} chars
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
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
                  พร้อมบันทึก และอยู่ใน token budget ที่กำหนด
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  {draft?.id ? `แก้ไขล่าสุด: ${formatDate(selectedProfile?.updatedAt)}` : 'Profile ใหม่จะยังไม่ผูกกับ agent จนกว่าจะบันทึกก่อน'}
                </p>
                <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || validation.length > 0 || !dirty}>
                  <Save className="mr-2 size-4" />
                  {saveProfile.isPending ? 'กำลังบันทึก...' : draft?.id ? 'บันทึกการแก้ไข' : 'สร้าง Profile'}
                </Button>
              </div>
            </CardContent>
          </Card>

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
                  {agents.map(agent => {
                    const linked = linkedAgents.includes(agent.id)
                    return (
                      <div key={agent.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-medium">{agent.id}</p>
                          <p className="truncate text-xs text-zinc-500">{agent.workspace}</p>
                        </div>
                        <Button
                          variant={linked ? 'default' : 'outline'}
                          size="sm"
                          disabled={linkAgent.isPending}
                          onClick={() => linkAgent.mutate({ profileId: activeProfileId, agentId: agent.id, linked })}
                        >
                          <Link2 className="mr-1.5 size-3.5" />
                          {linked ? 'Linked' : 'Link'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
              {activeProfileId && linkedAgents.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  หลังแก้ไข profile ให้เข้า agent ที่ผูกไว้แล้วกด Load Template เพื่อ apply เข้า SOUL ใหม่
                </div>
              )}
            </CardContent>
          </Card>
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
    </div>
  )
}

function FieldTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          onClick={() => {
            navigator.clipboard.writeText(value)
            toast.success('คัดลอกแล้ว')
          }}
        >
          <Copy className="size-3" />
          copy
        </button>
      </div>
      <Textarea value={value} onChange={e => onChange(e.target.value)} className="min-h-[120px] text-sm" />
      <p className="text-xs text-zinc-400">หนึ่งบรรทัดต่อหนึ่งรายการ เก็บเป็นรายละเอียดของ profile แต่ไม่ inject เข้า SOUL ทั้งหมด</p>
    </div>
  )
}
