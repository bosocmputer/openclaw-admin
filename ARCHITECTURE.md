# openclaw-admin — Architecture

> อัปเดต: 2026-07-06 (OpenClaw v2026.6.11 + ERP runtime overlay, LINE burst coalescing, Conversation Analysis, Auto-Learn hardening)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Admin Browser                               │
│                  http://192.168.2.109:3000                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (TanStack Query + axios)
                               │ session cookie (JWT HttpOnly)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│             openclaw-admin — Next.js (Docker port 3000)             │
│             github: bosocmputer/openclaw-admin                      │
│             deploy: docker compose up -d --build                    │
│             proxy.ts → guard ทุก route, redirect /login             │
├─────────────────────────────────────────────────────────────────────┤
│             PostgreSQL 16 (Docker port 5432)                        │
│             volume: postgres_data — admin, webchat, audit,          │
│             conversation analysis, business profiles, learning queue │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP REST (Bearer token, ผ่าน /api/proxy — ซ่อน token จาก browser)
                               │ API_URL = http://192.168.2.109:4000  (server-only env)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│             openclaw-api — Express.js (pm2 port 4000)               │
│             github: bosocmputer/openclaw-api                        │
│             deploy: git pull && npm ci --omit=dev && pm2 restart    │
└───┬───────────────┬────────────────┬──────────────────┬─────────────┘
    │               │                │                  │
    ▼               ▼                ▼                  ▼
~/.openclaw/   ~/.openclaw/      ~/.openclaw/      OpenClaw runtime
openclaw.json  workspace-*/      workspace-*/      (gateway restart,
               SOUL.md           config/           doctor, model test)
                                 mcporter.json
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │ openclaw-gateway │
                                              │ pm2 + ERP runtime│
                                              │ port 18789       │
                                              └────────┬────────┘
                                                       │ HTTP POST /call
                                                       │ Header: mcp-access-mode
                                                       ▼
                                              ┌─────────────────────┐
                                              │  SML MCP Connect    │
                                              │  port 3002 (default)│
                                              │  /call /tools       │
                                              └────────┬────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  PostgreSQL ERP  │
                                              │  Database        │
                                              └─────────────────┘
```

> **v2 Integration (2026-03-26)**: openclaw-gateway เรียก SML MCP Connect ผ่าน `HTTP POST /call` โดยตรง
> แทนการใช้ mcporter exec — latency ลดจาก ~48 วินาที เหลือ ~1-3 วินาที

## 4 Services

| Service | Deploy | Port | Repo | อัปเดต |
| ------- | ------ | ---- | ---- | ------ |
| openclaw-gateway | pm2 + ERP runtime overlay | 18789 | local OpenClaw runtime overlay | `pm2 restart openclaw-gateway` |
| openclaw-api | pm2 | 4000 | bosocmputer/openclaw-api | `git pull --ff-only origin main && npm ci --omit=dev && pm2 restart openclaw-api --update-env` |
| openclaw-admin | Docker | 3000 | bosocmputer/openclaw-admin | `git pull --ff-only origin main && docker compose build openclaw-admin && docker compose up -d openclaw-admin` |
| PostgreSQL | Docker | 5432 | — (same compose) | restart อัตโนมัติกับ openclaw-admin |

---

## Data Flow แต่ละ Feature

### 1. อ่าน/เขียน Config (openclaw.json)

```
Browser → GET /api/config → อ่าน ~/.openclaw/openclaw.json → return JSON
Browser → PUT /api/config → รับ JSON → เขียนทับ ~/.openclaw/openclaw.json
```

ใช้ใน: Dashboard (read), Agents (add/delete), Telegram (bot/policy), Model & Keys (provider key/model), System Check

---

### 2. Gateway Restart

```
Browser → POST /api/gateway/restart
  → Express พยายาม pm2 restart openclaw-gateway ก่อน
  → fallback เป็น openclaw gateway restart เฉพาะ environment ที่ไม่ได้ใช้ pm2
  → gateway โหลด openclaw.json ใหม่
```

Production policy:

- customer server ควรรัน gateway จาก `/root/openclaw-runtime-2026.6.11-erp/dist/index.js gateway --port 18789`
- หลีกเลี่ยงการ restart ด้วย global `openclaw gateway restart` ใน production เพราะอาจกลับไปใช้ official/global runtime แทน ERP runtime overlay
- restart action ใน Admin ต้องมี confirm และแสดงผลลัพธ์ชัดเจน

---

### 3. System Health / Self-Service Remediation

```
Browser → GET /api/system/health?refresh=true
  → Express รวมสถานะ gateway, runtime, model readiness, MCP, channel, SOUL และ telemetry
  → return health checks + warnings + support bundle metadata

Browser → POST /api/models/runtime-test
  → ทดสอบเฉพาะ model ที่ admin กดเอง ไม่รันอัตโนมัติตอนเปิดหน้า

Browser → POST /api/dashboard/telegram-regression/pass
  → บันทึกว่า regression Telegram ผ่านแล้วหลัง runtime update

Browser → POST /api/gateway/restart
  → restart gateway ผ่าน pm2-first flow
```

UI `/system` แยกสิ่งที่ต้องจัดการจริง (`warn`/`fail`) ออกจากข้อมูลประกอบ (`info`) และซ่อน action เสี่ยงเมื่อระบบ OK

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
  GET /api/agents/:id/soul/template → โหลด SOUL template ตาม Access Mode + mcpUrl ปัจจุบัน
  dirty state → badge "Unsaved" จนกว่าจะ save

  SOUL template (v2):
    AI ใช้ curl -X POST {mcpCallUrl} พร้อม Content-Type + mcp-access-mode header
    mcpCallUrl = mcporter.json URL แทน /sse ด้วย /call
    Parse response: content[0].text → JSON.parse() → ข้อมูล ERP

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

### 7. LINE Official Account

```
LINE Console → HTTPS webhook → cloudflared tunnel (port 18789) → openclaw-gateway

แต่ละ OA ต้องมี webhookPath ไม่ซ้ำกัน เช่น:
  /line/webhook/sale   ← OA sale (default)
  /line/webhook/stock  ← OA stock (named account)

Root cause ถ้า path ซ้ำ:
  registerPluginHttpRoute (replaceExisting:true) → OA ที่ start ทีหลัง override handler → OA แรก 401

GET /api/line → อ่าน channels.line จาก openclaw.json
GET /api/line/botinfo → เรียก LINE API getProfile ต่อ account → return { accountId: { displayName, pictureUrl, basicId } }
GET /api/line/bindings → กรอง bindings[] type:"route" channel:"line" → [{ accountId, agentId }]
POST /api/line/accounts { accountId, channelAccessToken, channelSecret, webhookPath }
  → เพิ่ม accounts[accountId] = { channelAccessToken, channelSecret, webhookPath, dmPolicy:"open" }
  → PUT /api/config  ← dmPolicy="open" เสมอ (pairing ถูกลบออกแล้ว)
DELETE /api/line/accounts/:id → ลบ accounts[id] + bindings ออกจาก config

LINE session key: agent:<agentId>:line:direct:<lineUserId>
cloudflared: expose port 18789 เป็น HTTPS public URL (ดู INSTALL.md ขั้นตอน 11.9)
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
GET  /api/models/catalog?provider=x
  → live provider catalog + cache + clear status (ready/missing_key/auth_error/timeout)

GET  /api/models/readiness?refresh=false
  → อ่าน openclaw.json แล้วตรวจ primary/fallback/image model เทียบ catalog + runtime verification cache

POST /api/models/message-test
  → admin พิมพ์ข้อความทดสอบเอง แล้ว runtime เรียก primary/fallback จริง

POST /api/models/image-message-test
  → ทดสอบอ่านรูปสินค้าแบบ optional โดยใช้ chat model หรือ image model แยก

PUT  /api/models/settings
  → atomic config write + backup + validation ก่อนบันทึก

UI `/model`:
  Provider Keys → Model ข้อความ → ทดสอบข้อความ → อ่านรูปสินค้า optional → Save → Restart Gateway
  OpenRouter และ Kilo แสดง catalog สด แต่การใช้งานจริงต้องผ่าน runtime test
  Key/token ไม่ถูกส่งกลับ frontend และผลลัพธ์ถูก truncate/redact
```

---

### 10. Monitor

```
GET /api/monitor/events
  → อ่าน ~/.openclaw/agents/*/sessions/ .jsonl files (last 50 lines ต่อ session)
  → กรอง: deleted webchat rooms (query webchat_rooms table), stale sessions (>3 วัน)
  → แปลง ts: new Date(timestamp).toISOString().slice(11,19) = UTC HH:MM:SS
  → stripGatewayMetadata() ตัด Telegram metadata + Webchat SECURITY NOTICE headers
  → parse channel จาก session key:
      contains ':telegram:' → channel='telegram'
      contains ':hook:'     → channel='webchat'
      contains ':line:'     → channel='line'
  → return MonitorData { agents[], stats, globalEvents[] }

UI: poll ทุก 3 วินาที
  Overview bar → session cards เรียงแนวนอน (thinking/tool_call ก่อน)
  Detail panel → global stream หรือ session ที่เลือก
  tsToThai(): UTC HH:MM:SS + 7h = เวลาไทย
```

---

### 11. Webhooks (ใหม่ — OpenClaw v2026.4.x)

```
GET  /api/webhooks        → อ่าน plugins.entries.webhooks.config.routes จาก openclaw.json
POST /api/webhooks        → เพิ่ม/แก้ route (name, path, sessionKey, secret, description)
DELETE /api/webhooks/:name → ลบ route
PATCH /api/webhooks/:name  → toggle enabled / แก้ description

หลักการ:
  ระบบภายนอก (ERP, LINE Notify) POST มาที่ gateway /webhooks/<path>
  พร้อม header X-Webhook-Secret: <secret>
  gateway inject payload เข้า sessionKey ที่กำหนด → agent ตอบกลับ

openclaw.json structure:
  plugins.entries.webhooks.config.routes.<name> = { path, sessionKey, secret, enabled?, description? }

หมายเหตุ: ต้อง restart gateway หลังแก้ไข route
```

---

### 12. Session Checkpoints (ใหม่ — OpenClaw v2026.4.5)

```
GET  /api/compaction/checkpoints/:agentId → scan *.jsonl.reset.* files
POST /api/compaction/restore { agentId, filename }
  → backup active session → copy checkpoint → restore

checkpoint files = ~/.openclaw/agents/<id>/sessions/<sessionId>.jsonl.reset.<ts>
สร้างอัตโนมัติเมื่อ gateway ทำ compaction (ตั้งค่าใน Compaction page)
```

---

### 13. Business Profiles

```
GET  /api/business-profiles/templates
GET  /api/business-profiles
POST /api/business-profiles
PUT  /api/business-profiles/:id
POST /api/business-profiles/:id/link-agent
DELETE /api/business-profiles/:id/link-agent/:agentId
GET  /api/agents/:id/business-profile

Browser → Business Profiles
  → PostgreSQL business_profiles + business_profile_agent_links
  → Agent Detail / Load Template
  → GET /api/agents/:id/soul/template?refreshTools=true
  → inject bounded "## Business Profile" block into SOUL template preview
  → admin กด Save SOUL เอง
```

หลักการ:

- Business Profile เป็น prompt context ไม่ใช่ business master data
- ไม่เขียนเข้า `openclaw.json`
- ไม่ auto-apply SOUL
- `soulBlock` ที่ inject ต้อง bounded และผ่าน validation ไม่ให้มี secret/token

---

### 14. Memory Learning

```
GET /api/memory/status
  → status ทุก agent:
      dailyMemory: { fileCount, totalChars, latestDate, latestPreview, files[] }
      memory: { exists, sizeChars, estimatedTokens, sizeWarning, preview } ← MEMORY.md
      dreams: { exists, sizeChars, canonicalName, path, preview }          ← DREAMS.md / dreams.md
      dreaming: { enabled, config, source }

GET  /api/memory/learning-candidates
POST /api/memory/learning-candidates
POST /api/memory/learning-candidates/:id/approve
POST /api/memory/learning-candidates/:id/reject
POST /api/memory/learning-candidates/:id/apply
GET  /api/memory/:agentId/backups
POST /api/memory/:agentId/rollback

Conversation Analysis → "ส่งเรื่องนี้ให้ Admin Review"
  → create learning candidate with sourceTurnIds + evidence
  → /memory?tab=learning
  → admin approve/reject/apply
```

ไฟล์ memory:

- `MEMORY.md` = ความจำที่ runtime ใช้ตอบจริง
- `memory/*.md` = working notes / daily memory สำหรับ review
- `DREAMS.md` หรือ `dreams.md` = review diary จาก dreaming phase ยังไม่ถือเป็น truth โดยตรง

Learning target:

- `memory`: apply เข้า managed section ใน `MEMORY.md` พร้อม backup/rollback
- `business_profile`: review ต่อใน `/business-profiles`
- `soul`: review ต่อใน Agent SOUL
- `mcp_search`: review ต่อใน MCP/Search normalization
- `model_runtime`: review ต่อใน Model/Runtime readiness

v1 ไม่ train model weights และไม่ auto-write memory จาก chat user โดยตรง

---

### 15. Analysis

```
GET /api/agents → จำนวน agents
GET /api/agents/:id/sessions → sessions + messages ต่อ agent (นับ tokens, users)
GET /api/members → รายการ members แยก role + สถานะ active
GET /api/webchat/rooms → รายการห้อง + policy + agent info
GET /api/gateway/logs → นับ ERROR/WARN/INFO/DEBUG + แสดง error ล่าสุด

UI sections:
  Overview     → 5 cards: Agents, Telegram Users, Members, Webchat Rooms, LINE OA
  Agents       → ต่อ agent: sessions, tokens, top users
  Webchat      → ต่อห้อง: policy, agent, สมาชิก
  LINE OA      → ต่อ account: displayName, basicId, pictureUrl
  Members      → จัดกลุ่มตาม role (superadmin/admin/chat) + active status
  System Logs  → นับตาม level + ตาราง error ล่าสุด
```

Conversation analysis เพิ่มเติม:

```
GET /api/analysis/conversations
  → อ่าน conversation_turns แบบ durable จาก PostgreSQL พร้อม filter date/agent/channel/status/tag

GET /api/analysis/conversations/:turnId
  → transcript timeline: user text, trace ที่ runtime บันทึกจริง, tool calls, model/cost/token, final answer, warnings

GET /api/analysis/conversations/insights
  → issue tags, top failed keywords, slow turns, agent breakdown

GET /api/analysis/conversations/export?mode=codex_review_pack
  → Markdown pack สำหรับส่งให้ Codex/ทีมวิเคราะห์ SOUL/MCP/search/memory ต่อ
  → รวม context snapshot แบบ redacted: memory policy/state, active/blocked memories, Business Profile links, channel bindings, model config, runtime/API/admin version

POST /api/memory/policies/:agentId/apply-auto-learn
  → apply Safe Auto-Learn สำหรับ agent จาก observations ที่เก็บไว้
```

หลักการ:

- `/monitor` เป็น live debug เดิม
- `/analysis/conversations` เป็น historical analysis + export โดยใช้ข้อมูล redacted/truncated จาก PostgreSQL
- media preview ใช้ opaque media id และ API allowlist เท่านั้น ไม่ expose local path หรือ Telegram file id
- export for Codex ไม่ export ไฟล์รูปจริง ส่งเฉพาะ metadata/text preview
- selected turn สามารถส่งเข้า `/memory` Learning Review ได้ แต่ยังไม่ apply อะไรจนกว่า admin approve

---

## File Structure

```
openclaw-admin/                       ← github: bosocmputer/openclaw-admin
├── app/
│   ├── layout.tsx                    ← root layout (ไม่มี Sidebar — อยู่ใน (admin)/layout)
│   ├── login/page.tsx                ← Login page (public)
│   ├── actions/auth.ts               ← Server Actions: login / logout
│   └── (admin)/                      ← route group — protected ทั้งหมด
│       ├── layout.tsx                ← Protected layout + Sidebar + QueryProvider
│       ├── page.tsx                  ← Dashboard (+ Clean Stale Sessions button)
│       ├── model/page.tsx            ← Model settings
│       ├── business-profiles/page.tsx ← Business Profile templates + agent links
│       ├── agents/
│       │   ├── page.tsx              ← Agents list
│       │   └── [id]/
│       │       ├── page.tsx          ← Agent Detail (2-column: SOUL ซ้าย, Users+MCP ขวา)
│       │       └── chat/page.tsx     ← Chat Monitor
│       ├── telegram/page.tsx         ← Telegram Bot management
│       ├── line/page.tsx             ← LINE OA management (multi-OA, webhookPath, QR pairing)
│       ├── logs/page.tsx             ← Live logs
│       ├── guide/page.tsx            ← คู่มือผู้ใช้
│       ├── members/page.tsx          ← จัดการสมาชิก (superadmin only)
│       ├── analysis/page.tsx         ← วิเคราะห์ข้อมูล operations (agents/sessions/tokens/members/logs)
│       ├── analysis/conversations/   ← Conversation history, issue triage, export, learning bridge
│       ├── monitor/page.tsx          ← real-time AI activity monitor (2-zone: overview bar + detail panel)
│       ├── compaction/page.tsx       ← ตั้งค่า Auto-compact (mode/maxHistoryShare/keepRecentTokens ฯลฯ)
│       ├── sessions/page.tsx         ← Session Checkpoints — ดูและ restore *.jsonl.reset.* files
│       ├── webhooks/page.tsx         ← Webhooks — CRUD routes สำหรับ OpenClaw Webhooks plugin
│       ├── memory/page.tsx           ← Memory Learning + Review Queue + file viewer
│       └── webchat/
│           ├── page.tsx              ← Server Component — ส่ง session ลง client
│           └── webchat-client.tsx    ← Chat UI (2-column admin / minimal chat user)
│
├── components/
│   ├── sidebar.tsx                   ← Navigation + logout + แสดงชื่อ/role
│   ├── query-provider.tsx            ← TanStack Query Provider
│   └── ui/                           ← shadcn/ui components
│
├── lib/
│   ├── api.ts                        ← axios instance + TypeScript types + API functions
│   ├── session.ts                    ← JWT encrypt/decrypt (jose)
│   ├── db.ts                         ← PostgreSQL client (postgres.js)
│   ├── audit.ts                      ← audit log helper (บันทึก login/logout/failed)
│   └── rate-limit.ts                 ← Login rate limiter (in-memory)
│
├── db/
│   └── init.sql                      ← CREATE TABLE admin_users + seed superadmin
│
├── proxy.ts                          ← Route guard (Next.js 16 ใช้ proxy.ts)
├── Dockerfile                        ← Build Next.js standalone
├── docker-compose.yml                ← openclaw-admin + PostgreSQL
├── .env.local                        ← local dev env
├── PLAN.md                           ← Project plan (Thai)
└── ARCHITECTURE.md                   ← ไฟล์นี้

openclaw-api/                         ← github: bosocmputer/openclaw-api (แยก repo)
├── index.js                          ← Express entry point: middleware, routes, listen (ไม่ใช่ single-file อีกต่อไป)
├── lib/
│   ├── config.js                     ← shared constants: HOME, CONFIG_PATH, USERNAMES_PATH
│   ├── files.js                      ← readConfig, writeConfig, readUserNames, writeUserNames
│   ├── pg.js                         ← pgPool init + requirePg middleware
│   └── soul-template.js              ← generateSoulTemplate per access mode/persona
├── routes/                           ← แยก route ต่อ feature
│   ├── agents.js, telegram.js, line.js, model.js, gateway.js
│   ├── members.js, webchat.js, monitor.js, alerting.js
│   ├── config.js, status.js
│   ├── webhooks.js                   ← CRUD routes สำหรับ plugins.entries.webhooks.config.routes
│   ├── compaction.js                 ← list/restore session checkpoints (*.jsonl.reset.*)
│   ├── analysis.js                   ← durable conversation history, insights, exports
│   ├── business-profiles.js          ← business profile templates, CRUD, agent links
│   └── memory.js                     ← memory status, learning candidates, backups, rollback
├── package.json                      ← dependencies: express, bcryptjs, pg, cors, helmet, dotenv
└── .env                              ← API_TOKEN, PORT, DATABASE_URL, HOOKS_TOKEN, ALLOWED_ORIGIN, feature flags
```

---

## State Management

```
TanStack Query (React Query v5)
  ├── queryKey: ['status']              → refetchInterval: 15s
  ├── queryKey: ['config']              → on-demand
  ├── queryKey: ['agents']              → on-demand
  ├── queryKey: ['doctor-status']       → refetchInterval: 60s
  ├── queryKey: ['models']              → on-demand
  ├── queryKey: ['sessions', id]        → on-demand
  ├── queryKey: ['logs']                → polling manual ทุก 3s
  ├── queryKey: ['monitor']             → refetchInterval: 3s
  ├── queryKey: ['webhooks']            → on-demand
  ├── queryKey: ['checkpoints', agent]  → on-demand (เมื่อเลือก agent)
  ├── queryKey: ['business-profiles']   → on-demand
  ├── queryKey: ['analysis-conversations'] → bounded pagination/filter
  ├── queryKey: ['memory-status']       → on-demand / refresh
  └── queryKey: ['memory-learning-candidates'] → on-demand

Mutations → invalidateQueries หลัง success
Local UI state → useState (dialog open/close, form inputs, tab)
```

---

## API Authentication

```
Browser → Next.js /api/proxy/* (JWT session cookie)
  ↓ (server-side เท่านั้น — token ไม่ถูกส่งไป browser)
Next.js proxy → Express API
  Header: Authorization: Bearer <API_TOKEN>
  Config: API_TOKEN ใน .env (server-only, ไม่มี NEXT_PUBLIC_)

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
| MCP call ผ่าน HTTP POST /call แทน mcporter exec | ลด latency จาก ~48s → ~1-3s, DB pool persistent |
| SOUL template ใช้ curl POST /call | AI ไม่ต้อง spawn mcporter process ทุกครั้ง — เร็วกว่า 10-15x |
