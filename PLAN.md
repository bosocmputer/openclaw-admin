# OpenClaw Admin — Project Plan

> อัปเดตล่าสุด: 2026-03-24 (รอบ 6)

---

## บริบทโปรเจค

**OpenClaw ERP Chatbot** สำหรับบริษัท SML — Web Admin Panel ให้ config ได้จากหน้าเว็บโดยไม่ต้อง SSH server

- Server: Ubuntu 24.04 LTS (192.168.2.109, user: bosscatdog)
- OpenClaw: v2026.3.13

## 3 Services บน Server

| Service | Repo | Deploy | Port | หมายเหตุ |
| ------- | ---- | ------ | ---- | -------- |
| **openclaw-gateway** | — | systemd | 18789 | ติดตั้งโดย openclaw CLI |
| **openclaw-api** | [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api) | pm2 บน host | 4000 | ต้องรันบน host เพราะใช้ systemd + openclaw CLI |
| **openclaw-admin** | [bosocmputer/openclaw-admin](https://github.com/bosocmputer/openclaw-admin) | Docker | 3000 | Next.js Web UI |

### Deploy / อัปเดตแต่ละ Service

**openclaw-gateway** (systemd — ไม่ต้องแตะ):

```bash
openclaw gateway restart
```

**openclaw-api** (pm2):

```bash
cd ~/openclaw-api
git pull
npm install
pm2 restart openclaw-api
```

**openclaw-admin** (Docker):

```bash
cd ~/openclaw-admin
git pull
docker compose up -d --build
```

---

## Architecture

```
Browser → Next.js (localhost:3000) → Express API (server:4000) → openclaw.json / SOUL.md / mcporter.json
```

---

## Stack

| ส่วน | Technology |
|------|-----------|
| Framework | Next.js 16.2.0 + TypeScript + Turbopack |
| UI | shadcn/ui + Tailwind CSS |
| Data | TanStack Query v5 |
| HTTP | axios |
| Toast | Sonner v2 |
| Auth | JWT (jose) ใน HttpOnly Cookie — proxy.ts guard |
| Database | PostgreSQL 16 (Docker) — admin_users table |

---

## หน้าทั้งหมด (สร้างเสร็จแล้ว ✅)

### 1. Dashboard (`/`)
- Gateway status badge (online/offline) + ปุ่ม Restart Gateway
- จำนวน agents / users / bots / default model
- **Config Health card** — เช็ค config valid/invalid + ปุ่ม Auto Fix (รัน `openclaw doctor --fix`)

### 2. Model (`/model`)
- **Multi-provider**: OpenRouter, Google, Anthropic, OpenAI — เลือก provider ด้วยปุ่ม grid
- **API Key** ต่อ provider — Show/Hide, Test (ping endpoint), Save
- Model ที่ใช้อยู่ตอนนี้
- Model แนะนำ 4 ตัว (OpenRouter only: free / ประหยัด / แนะนำ / ดีสุด)
- **Combobox search** (shadcn Command+Popover) เลือก model + แสดงราคา
- โหลด model เดิมที่บันทึกไว้ถูกต้องแม้ switch provider (ใช้ `useRef` guard init)
- Layout 2 คอลัมน์บนจอกว้าง

### 3. Agents (`/agents`)
- รายการ agents ทั้งหมด พร้อม users badge (grid 3 คอลัมน์)
- เพิ่ม agent — ระบุ **Agent ID** + **Access Mode** (admin/sales/purchase/stock/general) → server auto-generate `SOUL.md` จาก template ตาม mode
- ลบ agent — ใช้ **Dialog** (ไม่ใช้ browser confirm)

### 4. Agent Detail (`/agents/[id]`)
- **ไม่มี Tab** — 2-column layout เห็นทุกส่วนพร้อมกัน
- ซ้าย: **SOUL** — textarea full height, badge "Unsaved", ปุ่ม **Load Template** โหลด template ตาม Access Mode ปัจจุบันจาก server (path ใช้ `~` ไม่ hardcode username)
- ขวาบน: **Users** — เพิ่ม/ลบ Telegram user ID + nickname, กด Enter ได้, **auto restart gateway** หลัง add/remove
- ขวาล่าง: **MCP** — URL + Ping (เช็ค online), Access Mode (admin/sales/purchase/stock/general), ปุ่ม Test Access รัน `mcporter list --json` ดู tools จริงบน server, tools list collapsible
- ปุ่ม Chat Monitor → `/agents/[id]/chat`
- **MCP_ACCESS_MODE options**: admin, sales, purchase, stock, general (default)
- **Role ส่งผ่าน HTTP header** `mcp-access-mode` (ไม่ใช่ env) — บันทึกใน `mcporter.json` ใต้ `headers` field
- **Tool count จริงต่อ role**: admin=9+(~12 admin-only), sales=7, purchase=5, stock=6, general=4

### 5. Agent Chat Monitor (`/agents/[id]/chat`)
- Sidebar แสดง Users แยกตาม sender_id
- Chat bubbles threaded ตาม turn ของ user (เฉพาะ assistant replies ใน turn นั้น)
- Analytics: users, messages, tokens, sessions

### 6. Telegram (`/telegram`)
- **How it works card** — อธิบายขั้นตอน 4 ขั้น
- **เพิ่ม Bot ใหม่** — validate ห้ามชื่อซ้ำ/ห้ามชื่อ `default`, default dmPolicy=open, เขียน config โดยตรง (ไม่ใช้ CLI)
- **Bot cards** แต่ละ account (grid 2 คอลัมน์):
  - ชื่อ bot จริงจาก Telegram API (`getMe`)
  - Dropdown ผูก Agent + **warning ถ้ายังไม่ได้ผูก** (bot จะ fallback ไป default agent)
  - Bot Token — Show/Hide, Save
  - DM Policy: **open** (ค่าเริ่มต้น) / **allowlist** เท่านั้น
  - Warning + link นำทาง ถ้าเลือก allowlist แต่ยังไม่มี user
  - Users ที่อนุญาต — read-only badges (กรอง `"*"` ออก), link ไปหน้า Agent
  - ปุ่ม **Set as Default** → เปิด Dialog (validate ห้ามชื่อซ้ำ/ห้าม `default`)
  - ปุ่ม **Delete Bot** → เปิด Dialog (ซ่อนสำหรับ default), ลบ config โดยตรง (ไม่ใช้ CLI)

### 7. Chats (`/chats`)
- เลือก agent (ปุ่ม top)
- Analytics: users, messages, tokens, sessions
- Sidebar Users แยกตาม sender_id
- Chat threaded ตาม turn ของ user

### 8. Logs (`/logs`)
- Live polling ทุก 3 วินาที
- Filter level: ALL / INFO / WARN / ERROR / DEBUG
- ค้นหา message / subsystem
- Pause / Resume, Auto scroll

### 9. คู่มือผู้ใช้ (`/guide`)
- ขั้นตอน 3 ขั้น: หา User ID → Admin เพิ่มสิทธิ์ → Start bot (พิมพ์คุยได้เลย)
- ตารางสรุป "สิ่งที่ต้องส่งให้ Admin": Telegram User ID + ชื่อ/แผนก
- Troubleshoot เบื้องต้น (ไม่มี Pairing code แล้ว — ถูกลบออก)

### 10. Login (`/login`)
- หน้า login สาธารณะ (ไม่ต้อง auth)
- JWT session 7 วัน ใน HttpOnly Cookie
- `proxy.ts` guard redirect ทุกหน้าถ้าไม่มี session

### 11. สมาชิก (`/members`) — เฉพาะ superadmin
- รายการ admin_users ทั้งหมด
- เพิ่ม/ลบ/disable user, reset password, เปลี่ยน role
- Roles: superadmin / admin / viewer

---

## Express API Endpoints (บน server — `~/openclaw-api/index.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | gateway online/offline |
| GET | `/api/config` | อ่าน openclaw.json |
| PUT | `/api/config` | เขียน openclaw.json |
| GET | `/api/agents` | รายการ agents + soul + mcp + users |
| POST | `/api/agents` | เพิ่ม agent ใหม่ + auto-generate SOUL.md จาก template ตาม `accessMode` |
| GET | `/api/agents/:id/soul/template` | ดึง SOUL template ตาม Access Mode ปัจจุบันของ agent (path ใช้ `~`) |
| DELETE | `/api/agents/:id` | ลบ agent |
| GET | `/api/agents/:id/soul` | อ่าน SOUL.md |
| PUT | `/api/agents/:id/soul` | เขียน SOUL.md |
| GET | `/api/agents/:id/mcp` | อ่าน mcporter.json |
| PUT | `/api/agents/:id/mcp` | เขียน mcporter.json |
| GET | `/api/agents/:id/users` | รายการ users ของ agent |
| POST | `/api/agents/:id/users` | เพิ่ม user (+ เพิ่ม allowFrom ถูก account อัตโนมัติ) |
| DELETE | `/api/agents/:id/users/:userId` | ลบ user |
| GET | `/api/usernames` | อ่าน usernames.json |
| GET | `/api/models` | ดึง model list จาก OpenRouter |
| POST | `/api/gateway/restart` | รัน `openclaw gateway restart` |
| GET | `/api/gateway/logs` | อ่าน JSONL log จาก `/tmp/openclaw/` |
| GET | `/api/agents/:id/sessions` | รายการ sessions ของ agent |
| GET | `/api/agents/:id/sessions/:sessionId` | messages ใน session |
| GET | `/api/telegram/botinfo` | ชื่อ bot จริงจาก Telegram API |
| GET | `/api/telegram/bindings` | route bindings (bot → agent) |
| PUT | `/api/telegram/bindings` | set route binding |
| POST | `/api/telegram/accounts` | เพิ่ม bot account ใหม่ |
| DELETE | `/api/telegram/accounts/:id` | ลบ bot account |
| POST | `/api/telegram/set-default` | สลับ bot ขึ้นเป็น default |
| POST | `/api/telegram/approve` | approve pairing code (ยังมีใน server แต่ไม่มีใน UI แล้ว) |
| GET | `/api/doctor/status` | เช็ค config valid/invalid + ดึง problems |
| POST | `/api/doctor/fix` | รัน `openclaw doctor --fix` |
| GET | `/api/members` | รายการ admin_users (ต้องการ DATABASE_URL) |
| POST | `/api/members` | เพิ่ม admin user ใหม่ (bcrypt password) |
| PATCH | `/api/members/:id` | แก้ role / display_name / is_active / password |
| DELETE | `/api/members/:id` | ลบ admin user (ห้ามลบ superadmin คนสุดท้าย) |

---

## Config Structure ปัจจุบัน (OpenClaw v2026.3.13)

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-v1-...",
    "MCP_ACCESS_MODE": "open"
  },
  "agents": {
    "defaults": { "model": { "primary": "openrouter/qwen/qwen3.5-flash-02-23" } },
    "list": [
      { "id": "sale", "workspace": "~/.openclaw/workspace-sale" },
      { "id": "stock", "workspace": "~/.openclaw/workspace-stock" }
    ]
  },
  "bindings": [
    { "type": "route", "agentId": "sale", "match": { "channel": "telegram", "accountId": "default" } },
    { "type": "route", "agentId": "stock", "match": { "channel": "telegram", "accountId": "stock" } },
    { "agentId": "sale", "match": { "channel": "telegram", "accountId": "default", "peer": { "kind": "direct", "id": "..." } } },
    { "agentId": "stock", "match": { "channel": "telegram", "accountId": "stock", "peer": { "kind": "direct", "id": "..." } } }
  ],
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "open",
      "groupPolicy": "allowlist",
      "streaming": "partial",
      "accounts": {
        "default": {
          "botToken": "...",
          "dmPolicy": "open",
          "allowFrom": ["*"]
        },
        "stock": {
          "botToken": "...",
          "dmPolicy": "allowlist",
          "allowFrom": [123456789]
        }
      }
    }
  },
  "session": { "dmScope": "per-channel-peer" }
}
```

---

## Files สำคัญ

| File | หมายเหตุ |
|------|---------|
| `openclaw-api/index.js` | git pull + pm2 restart openclaw-api |
| `lib/api.ts` | API functions ทั้งหมด |
| `lib/session.ts` | JWT encrypt/decrypt — COOKIE_SECURE=true เฉพาะ HTTPS |
| `lib/db.ts` | PostgreSQL client (postgres.js) |
| `proxy.ts` | Route guard — Next.js 16 ใช้ proxy.ts แทน middleware.ts |
| `db/init.sql` | CREATE TABLE admin_users + seed superadmin |
| `components/sidebar.tsx` | เมนู navigation + logout + แสดงชื่อ/role |
| `~/.openclaw/usernames.json` | ชื่อ Telegram user แยกนอก openclaw.json |

---

## หมายเหตุสำคัญ

- **openclaw.json schema strict** — ไม่รองรับ unknown keys เช่น `peer.name`, `userNames` → ต้องเก็บแยกใน `usernames.json`
- **Config format v2026.3.13**: botToken อยู่ใน `channels.telegram.accounts.*` เสมอ — ไม่ใช่ top-level
- **dmPolicy="open"** ต้องมี `"*"` ใน `allowFrom` มิฉะนั้น config invalid
- **dmPolicy="allowlist"** ต้องมี user ID อย่างน้อย 1 คนใน `allowFrom` มิฉะนั้น config invalid
- **Multi-bot**: ใช้ `openclaw channels add --account <id>` — แต่ละ bot อยู่ใน `channels.telegram.accounts.<id>`
- **Set as Default**: ห้ามตั้งชื่อ oldAccountId เป็น `"default"` — validate ทั้ง UI และ server
- **session.dmScope = per-channel-peer** — แยก session ต่อ user ต่อ channel
- **Gateway restart**: ใช้ `openclaw gateway restart` (systemd) — ไม่ใช่ pkill
- **Sonner v2**: ไม่รองรับ `toastOptions` — ลบออกแล้ว
- **Log format**: JSONL ที่ `/tmp/openclaw/openclaw-YYYY-MM-DD.log` — sort by mtime รองรับขึ้นวันใหม่
- **Dialog แทน confirm/alert**: ทุก destructive action ใช้ shadcn Dialog
- **Add/Delete Bot**: เขียน/ลบ config โดยตรง ไม่ใช้ `openclaw channels add/remove` CLI (เร็วกว่า ไม่ timeout)
- **Add Bot default**: dmPolicy=open, allowFrom=["*"] เสมอ
- **Bot ไม่ผูก Agent**: fallback ไป default agent — UI แสดง warning ใต้ dropdown
- **Peer binding ต้องมี `accountId`**: peer binding ที่ไม่มี `accountId` จะ match ทุก bot → user ที่ผูกกับ sale จะ DM stock bot ได้ด้วย — ต้องระบุ `accountId` เสมอ (POST /api/agents/:id/users แก้แล้ว v2026-03-23-r3)
- **POST /api/agents/:id/users**: สร้าง peer binding พร้อม `accountId` จาก route binding ของ agent อัตโนมัติ
- **DELETE /api/agents/:id/users/:userId**: ลบ allowFrom เฉพาะ account ที่ถูกต้อง (ใช้ `match.accountId` จาก route binding ไม่ใช่ channel string parse)
- **Login**: JWT ใน HttpOnly Cookie — `proxy.ts` guard ทุก route ยกเว้น `/login`
- **cookie secure**: ใช้ `COOKIE_SECURE=true` เฉพาะ HTTPS — HTTP ต้องปล่อย false (default)
- **proxy.ts**: Next.js 16 เปลี่ยนชื่อจาก `middleware.ts` → `proxy.ts` และ export ชื่อ `proxy` ไม่ใช่ `middleware`
- **Members API**: ต้องการ `DATABASE_URL` และ `pg` package ใน openclaw-api — ถ้าไม่ set จะ return 503
- **PostgreSQL**: อยู่ใน docker-compose เดียวกับ openclaw-admin — volume `postgres_data` ห้าม `down -v`
- **superadmin default**: `superadmin` / `superadmin` — seed ใน `db/init.sql` (bcrypt cost=12)
- **Telegram saveMutation**: refetch config ก่อน save เพื่อไม่ overwrite binding ที่เพิ่งเซฟ — `dmPolicy=open` ต้องมี `allowFrom: ['*']` เสมอ
