# openclaw-admin — Architecture

> อัปเดต: 2026-03-23 (รอบ 3)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Admin Browser                               │
│                    http://localhost:3000                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (TanStack Query + axios)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js App (port 3000)                           │
│                  app/**/page.tsx  (Client Components)               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP REST (Bearer token)
                               │ NEXT_PUBLIC_API_URL = http://192.168.2.109:4000
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Express API (port 4000)                             │
│                  ~/openclaw-api/index.js                             │
│                  token: sml-openclaw-2026                            │
└───┬───────────────┬────────────────┬──────────────────┬─────────────┘
    │               │                │                  │
    ▼               ▼                ▼                  ▼
~/.openclaw/   ~/.openclaw/      ~/.openclaw/      openclaw CLI
openclaw.json  workspace-*/      workspace-*/      (gateway restart,
               SOUL.md           config/           doctor)
                                 mcporter.json
```

---

## Data Flow แต่ละ Feature

### 1. อ่าน/เขียน Config (openclaw.json)

```
Browser → GET /api/config → อ่าน ~/.openclaw/openclaw.json → return JSON
Browser → PUT /api/config → รับ JSON → เขียนทับ ~/.openclaw/openclaw.json
```

ใช้ใน: Dashboard (read), Agents (add/delete), Telegram (bot/policy), Model (API key, model)

---

### 2. Gateway Restart

```
Browser → POST /api/gateway/restart
  → Express รัน: openclaw gateway restart
  → systemd restart openclaw-gateway.service
  → gateway โหลด openclaw.json ใหม่
```

ทริกเกอร์อัตโนมัติหลัง: add/remove user ใน Agent Detail

---

### 3. Config Health (Doctor)

```
Browser → GET /api/doctor/status
  → Express รัน: openclaw doctor
  → parse stdout → return { valid, problems[] }

Browser → POST /api/doctor/fix
  → Express รัน: openclaw doctor --fix
  → แก้ openclaw.json อัตโนมัติ
  → gateway restart
```

---

### 4. Agents

```
GET /api/agents
  → อ่าน openclaw.json (agents.list)
  → ต่อ workspace แต่ละตัว อ่าน SOUL.md + mcporter.json + users
  → merge กลับเป็น Agent[]

POST /api/agents { agentId, accessMode } → เพิ่ม agents.list[] + auto-generate SOUL.md จาก template ตาม accessMode
DELETE /api/agents/:id → ลบ agents.list[] + bindings[] ออกจาก config
```

---

### 5. Agent Detail

Layout: 2-column (ไม่มี Tab) — SOUL ซ้าย, Users+MCP ขวา

```
SOUL (ซ้าย):
  GET /api/agents/:id/soul → อ่าน ~/.openclaw/workspace-{id}/SOUL.md
  PUT /api/agents/:id/soul → เขียน SOUL.md
  GET /api/agents/:id/soul/template → โหลด SOUL template ตาม Access Mode ปัจจุบัน (path ใช้ ~)
  dirty state → badge "Unsaved" จนกว่าจะ save

Users (ขวาบน):
  GET /api/agents/:id/users → อ่าน openclaw.json bindings (peer binding) + usernames.json
  POST /api/agents/:id/users → เพิ่ม peer binding (พร้อม accountId จาก route binding) + allowFrom + usernames.json → gateway restart
  DELETE /api/agents/:id/users/:userId → ลบ peer binding + allowFrom (เฉพาะ account ที่ถูกต้อง) + usernames.json → gateway restart
  กด Enter เพื่อ add user ได้

MCP (ขวาล่าง):
  GET /api/agents/:id/mcp → อ่าน ~/.openclaw/workspace-{id}/config/mcporter.json
  PUT /api/agents/:id/mcp → เขียน mcporter.json
  Ping → GET URL → status < 500 = OK (ไม่ตัด /sse path)
  Test Access → POST /api/agents/:id/mcp/test { accessMode } → temp config override headers → mcporter list → tools[]
  Role ส่งผ่าน HTTP header "mcp-access-mode" (ไม่ใช่ env) บันทึกใน mcporter.json ใต้ headers field
  Tool count จริงต่อ role (จาก test-roles.mjs):
    admin=9 base + ~12 admin-only (get_sales_*, get_customer_rfm ฯลฯ)
    sales=7: search_product/customer, get_stock_balance, get_product_price, get_account_outstanding, get_bookout_balance, fallback_response
    purchase=5: search_product/supplier, get_stock_balance, get_account_incoming, fallback_response
    stock=6: search_product, get_stock_balance, get_account_incoming/outstanding, get_bookout_balance, fallback_response
    general=4: search_product, get_stock_balance, get_product_price, fallback_response
```

---

### 6. Telegram Bots

```
GET /api/config → อ่าน channels.telegram.accounts.*
GET /api/telegram/botinfo → แต่ละ account เรียก Telegram API getMe → return { accountId: botName }
GET /api/telegram/bindings → กรอง bindings[] type:"route" → return [{ accountId, agentId }]

เพิ่ม Bot:
  POST /api/telegram/accounts { accountId, token }
    → เพิ่ม accounts[accountId] = { botToken, dmPolicy:"open", allowFrom:["*"] }
    → PUT /api/config

ลบ Bot:
  DELETE /api/telegram/accounts/:id
    → ลบ accounts[id] ออกจาก config
    → ลบ bindings type:"route" ที่ accountId ตรงกัน
    → PUT /api/config

ผูก Agent:
  PUT /api/telegram/bindings { accountId, agentId }
    → แก้ bindings type:"route" accountId → agentId

Set as Default:
  POST /api/telegram/set-default { accountId, oldAccountId }
    → rename accounts[oldAccountId] → accounts["default"]
    → แก้ bindings accountId ตาม

Save DM Policy / Bot Token:
  PUT /api/config (เขียน accounts.* ใหม่ทั้งหมด)
```

---

### 7. Chat Monitor

```
GET /api/agents/:id/sessions
  → อ่าน log files ใน ~/.openclaw/workspace-{id}/ หรือ /tmp/openclaw/
  → group by sender_id → return ChatSession[]

GET /api/agents/:id/sessions/:sessionId
  → อ่าน session cMessages → return ChatMessage[]

UI: sidebar users → เลือก user → แสดง chat bubbles threaded by turn
```

---

### 8. Logs

```
GET /api/gateway/logs
  → อ่าน /tmp/openclaw/openclaw-YYYY-MM-DD.log (JSONL)
  → sort by mtime รองรับขึ้นวันใหม่
  → return log entries[]

UI: polling ทุก 3 วินาที, filter level, search message/subsystem, pause/resume
```

---

### 9. Model

```
GET /api/config → อ่าน env.<PROVIDER_KEY> + agents.defaults.model.primary
GET /api/models → ดึง model list จาก OpenRouter API (ผ่าน Express)
PUT /api/config → บันทึก API Key + model ที่เลือก

Multi-provider: OpenRouter / Google / Anthropic / OpenAI
  แต่ละ provider มี envKey, modelPrefix, testUrl ของตัวเอง
  Combobox (shadcn Command+Popover) ค้นหา + เลือก model + แสดงราคา
  switch provider กลับมา provider เดิม → restore model ที่บันทึกไว้
  Test API Key → ping testUrl ด้วย key ของ provider นั้น → OK / Error
```

---

## File Structure

```
openclaw-admin/
├── app/
│   ├── layout.tsx                    ← root layout + Sidebar + QueryProvider
│   ├── page.tsx                      ← Dashboard
│   ├── model/page.tsx                ← Model settings
│   ├── agents/
│   │   ├── page.tsx                  ← Agents list
│   │   └── [id]/
│   │       ├── page.tsx              ← Agent Detail (2-column: SOUL ซ้าย, Users+MCP ขวา)
│   │       └── chat/page.tsx         ← Chat Monitor
│   ├── telegram/page.tsx             ← Telegram Bot management
│   ├── chats/page.tsx                ← All chats (เลือก agent)
│   ├── logs/page.tsx                 ← Live logs
│   ├── mcp/page.tsx                  ← MCP (standalone)
│   └── guide/page.tsx                ← คู่มือผู้ใช้
│
├── components/
│   ├── sidebar.tsx                   ← Navigation menu
│   ├── query-provider.tsx            ← TanStack Query Provider
│   └── ui/                           ← shadcn/ui components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── sonner.tsx
│       ├── tabs.tsx
│       └── textarea.tsx
│
├── lib/
│   └── api.ts                        ← axios instance + TypeScript types + API functions
│
├── .env.local                        ← NEXT_PUBLIC_API_URL, NEXT_PUBLIC_API_TOKEN
├── PLAN.md                           ← Project plan (Thai)
└── ARCHITECTURE.md                   ← ไฟล์นี้
```

---

## State Management

```
TanStack Query (React Query v5)
  ├── queryKey: ['status']         → refetchInterval: 15s
  ├── queryKey: ['config']         → on-demand
  ├── queryKey: ['agents']         → on-demand
  ├── queryKey: ['doctor-status']  → refetchInterval: 60s
  ├── queryKey: ['models']         → on-demand
  ├── queryKey: ['sessions', id]   → on-demand
  └── queryKey: ['logs']           → polling manual ทุก 3s

Mutations → invalidateQueries หลัง success
Local UI state → useState (dialog open/close, form inputs, tab)
```

---

## API Authentication

```
Browser → Express API
  Header: Authorization: Bearer sml-openclaw-2026
  Config: NEXT_PUBLIC_API_TOKEN ใน .env.local

Express → Telegram API
  ใช้ botToken จาก openclaw.json โดยตรง

Express → OpenRouter API
  ใช้ OPENROUTER_API_KEY จาก openclaw.json
```

---

## Key Design Decisions

| Decision | เหตุผล |
|----------|--------|
| เขียน config โดยตรง (ไม่ใช้ CLI) | เร็วกว่า, ไม่ timeout, controllable |
| TanStack Query + axios | caching, loading states, invalidation ครบ |
| shadcn Dialog แทน confirm()/alert() | UX ดีกว่า, customizable |
| Gateway restart หลัง add/remove user | openclaw.json ไม่ hot-reload — ต้อง explicit |
| usernames.json แยกจาก openclaw.json | schema strict ไม่รองรับ peer.name |
| accounts.* เสมอ (ไม่ใช้ top-level botToken) | v2026.3.13 format ถูกต้อง |
| dmPolicy เหลือแค่ open/allowlist | pairing ถูกลบออก ไม่ได้ใช้แล้ว |
| peer binding ต้องมี accountId เสมอ | ไม่มี accountId → match ทุก bot → user ข้าม bot ได้ |
