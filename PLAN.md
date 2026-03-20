# OpenClaw Admin — Project Plan

> สร้างเมื่อ 2026-03-20 — ต่อยอดจาก ERP Chatbot project บน OpenClaw

---

## บริบทที่มาของโปรเจค

ก่อนหน้านี้เราได้ deploy **OpenClaw ERP Chatbot** สำหรับบริษัท SML โดย:

- ติดตั้ง OpenClaw 2026.3.13 บน Ubuntu 24.04 LTS (server: 192.168.2.109, user: bosscatdog)
- Telegram Bot: @sml_213_sale_bot
- Agents: `sale`, `stock` — พนักงานคุยผ่าน Telegram DM
- MCP: เชื่อม HTTP MCP server ที่ 192.168.2.213:3248 ผ่าน **mcporter CLI** (เพราะ OpenClaw v2026.3.13 ยังไม่รองรับ native .mcp.json)
- ปัญหาที่พบ: การ config ต้องเข้า SSH server ทุกครั้ง — ไม่สะดวกสำหรับการ deploy บริษัทใหม่

**โปรเจคนี้จึงเกิดขึ้นเพื่อแก้ปัญหานั้น** — สร้าง Web Admin Panel ให้ config ได้จากหน้าเว็บ

---

## Architecture Overview

```
Browser → Next.js (Vercel) → Express API (server:4000) → openclaw.json / SOUL.md / mcporter.json
```

### Server ที่มีอยู่ (192.168.2.109)

- OpenClaw gateway รันอยู่ที่ port 18789
- **Express API รันอยู่แล้วที่ port 4000** (`~/openclaw-api/index.js`)
- API Token: `sml-openclaw-2026`
- Files ที่ API จัดการ:
  - `~/.openclaw/openclaw.json` — config หลัก
  - `~/.openclaw/workspace-sale/SOUL.md` — SOUL ของ agent sale
  - `~/.openclaw/workspace-stock/SOUL.md` — SOUL ของ agent stock
  - `~/.openclaw/workspace-*/config/mcporter.json` — MCP config ต่อ agent

---

## Express API (บน server — ทำเสร็จแล้ว ✅)

**Location:** `~/openclaw-api/index.js` บน server 192.168.2.109

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | gateway online/offline |
| GET | `/api/config` | อ่าน openclaw.json ทั้งหมด |
| PUT | `/api/config` | เขียน openclaw.json |
| GET | `/api/agents` | รายการ agents + soul + mcp + users |
| GET | `/api/agents/:id/soul` | อ่าน SOUL.md ของ agent |
| PUT | `/api/agents/:id/soul` | เขียน SOUL.md ของ agent |
| GET | `/api/agents/:id/mcp` | อ่าน mcporter.json ของ agent |
| PUT | `/api/agents/:id/mcp` | เขียน mcporter.json ของ agent |
| POST | `/api/gateway/restart` | restart openclaw gateway |
| GET | `/api/models` | ดึง model list จาก OpenRouter |

**Auth:** Bearer token ใน header `Authorization: Bearer sml-openclaw-2026`

**ทดสอบแล้ว:**
```bash
curl -s -H "Authorization: Bearer sml-openclaw-2026" http://192.168.2.109:4000/api/status
# {"gateway":"online"}

curl -s -H "Authorization: Bearer sml-openclaw-2026" http://192.168.2.109:4000/api/agents
# ได้ข้อมูล agents sale + stock พร้อม soul, mcp, users
```

---

## OpenClaw Config จริงบน Server

### openclaw.json (สรุปส่วนสำคัญ)

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-v1-...",
    "MCP_ACCESS_MODE": "open"
  },
  "agents": {
    "defaults": {
      "model": { "primary": "openrouter/google/gemini-2.0-flash-lite-001" }
    },
    "list": [
      { "id": "sale", "workspace": "~/.openclaw/workspace-sale" },
      { "id": "stock", "workspace": "~/.openclaw/workspace-stock" }
    ]
  },
  "bindings": [
    { "agentId": "sale", "match": { "channel": "telegram", "peer": { "kind": "direct", "id": "7548005041" } } },
    { "agentId": "sale", "match": { "channel": "telegram", "peer": { "kind": "direct", "id": "7065340944" } } }
  ],
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "botToken": "...",
      "allowFrom": [7548005041, 7065340944]
    }
  },
  "gateway": { "mode": "local" }
}
```

### MCP Config (workspace-sale/config/mcporter.json)

```json
{
  "mcpServers": {
    "smlmcp": {
      "type": "http",
      "url": "http://192.168.2.213:3248/sse",
      "allowHttp": true,
      "env": { "MCP_ACCESS_MODE": "open" }
    }
  }
}
```

---

## Next.js Project (ต้องสร้างใหม่)

### Stack

| ส่วน | Technology |
|------|-----------|
| Framework | Next.js 15 + TypeScript |
| UI Components | shadcn/ui |
| Styling | Tailwind CSS |
| State/Data | React Query (TanStack Query) |
| Deploy | Vercel |

### โครงสร้างไฟล์

```
openclaw-admin/
├── app/
│   ├── layout.tsx              ← root layout + sidebar
│   ├── page.tsx                ← Dashboard / Status
│   ├── model/page.tsx          ← เปลี่ยน AI model
│   ├── mcp/page.tsx            ← config MCP server
│   ├── agents/
│   │   ├── page.tsx            ← รายการ agents
│   │   └── [id]/page.tsx       ← แก้ไข agent (SOUL + Users + MCP)
│   └── telegram/page.tsx       ← Telegram Bot config
├── components/
│   ├── sidebar.tsx
│   ├── status-badge.tsx
│   └── agent-card.tsx
├── lib/
│   └── api.ts                  ← fetch wrapper ไปที่ Express API
├── .env.local                  ← NEXT_PUBLIC_API_URL + NEXT_PUBLIC_API_TOKEN
└── PLAN.md                     ← ไฟล์นี้
```

---

## หน้าทั้งหมดที่ต้องสร้าง

### 1. Dashboard (`/`)
- แสดง gateway status badge (online/offline)
- Telegram bot connected หรือไม่
- จำนวน agents / users ทั้งหมด
- ปุ่ม Restart Gateway

### 2. Model Config (`/model`)
- แสดง model ปัจจุบัน
- Dropdown/Search เลือก model จาก OpenRouter
- แสดงราคา input/output ต่อ model
- ปุ่ม Save → PUT /api/config

### 3. MCP Config (`/mcp`)
- URL ของ MCP server
- ทดสอบ connection ได้จากหน้าเว็บ

### 4. Agents (`/agents`)
- รายการ agents ทั้งหมด (card แต่ละตัว)
- ปุ่มเพิ่ม agent ใหม่
- ปุ่มลบ agent

### 5. Agent Detail (`/agents/[id]`)
- Tab: **SOUL** — textarea แก้ SOUL.md
- Tab: **Users** — เพิ่ม/ลบ Telegram user ID + ชื่อเล่น
- Tab: **MCP** — URL, MCP_ACCESS_MODE
- ปุ่ม Save ต่อ tab

### 6. Telegram Config (`/telegram`)
- Bot token (masked)
- dmPolicy toggle
- allowFrom list

---

## Environment Variables

### `.env.local` (Next.js บน Mac/Vercel)

```env
NEXT_PUBLIC_API_URL=http://192.168.2.109:4000
NEXT_PUBLIC_API_TOKEN=sml-openclaw-2026
```

---

## ลำดับการทำ (Phase 2 — Next.js)

```
Step 1: สร้าง Next.js project
  npx create-next-app@latest openclaw-admin --typescript --tailwind --app --no-src-dir

Step 2: ติดตั้ง dependencies
  npx shadcn@latest init
  npm install @tanstack/react-query axios

Step 3: สร้าง lib/api.ts
  - fetch wrapper พร้อม Bearer token

Step 4: Layout + Sidebar
  - sidebar navigation

Step 5: หน้า Dashboard
  - status badge, restart button

Step 6: หน้า Model
  - dropdown model list

Step 7: หน้า Agents + Agent Detail
  - SOUL editor, Users management, MCP config

Step 8: หน้า Telegram
  - bot token, allowFrom

Step 9: Deploy บน Vercel
  - ตั้ง env vars
  - ทดสอบ end-to-end
```

---

## หมายเหตุสำคัญ

- **Gateway hot-reload**: แก้ `openclaw.json` แล้วบันทึก — gateway reload อัตโนมัติ ไม่ต้อง restart (ยกเว้นเพิ่ม agent ใหม่)
- **mcporter**: ใช้ผ่าน exec tool ใน SOUL.md — ไม่ใช่ native MCP (รอ OpenClaw version ใหม่)
- **model format**: ใส่ใน openclaw.json เป็น `openrouter/<provider>/<model-id>` เช่น `openrouter/google/gemini-2.0-flash-lite-001`
- **Telegram user ID**: ต้องเป็น numeric ID เท่านั้น (ไม่ใช่ @username) หาได้จาก @userinfobot
- **Express API**: รันอยู่แล้วบน server — ถ้า server reboot ต้องรัน `nohup node ~/openclaw-api/index.js > /tmp/openclaw-api.log 2>&1 &` ใหม่
