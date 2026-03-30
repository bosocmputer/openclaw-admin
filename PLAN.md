# OpenClaw Admin — Project Plan

> อัปเดตล่าสุด: 2026-03-30 (รอบ 10)

---

## บริบทโปรเจค

**OpenClaw ERP Chatbot** สำหรับบริษัท SML — Web Admin Panel ให้ config ได้จากหน้าเว็บโดยไม่ต้อง SSH server

- Server: Ubuntu 24.04 LTS (192.168.2.109, user: bosscatdog)
- OpenClaw: v2026.3.28+

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
- **Multi-provider**: OpenRouter, Google, Anthropic, OpenAI, Azure, Ollama, **Kilo AI** — เลือก provider ด้วยปุ่ม grid
- **API Key** ต่อ provider — Show/Hide, **Test server-side** (POST /api/models/test), Save
- Model list โหลดจาก API จริงทุก provider (GET /api/models?provider=xxx)
- **Smart save** — ปุ่มแสดงเฉพาะสิ่งที่เปลี่ยน (key / model / both)
- **Restart Gateway** button ปรากฏหลัง save สำเร็จ
- Per-provider info: desc, keyUrl, keyHint
- **Combobox search** (shadcn Command+Popover) เลือก model + แสดงราคา
- โหลด model เดิมที่บันทึกไว้ถูกต้องแม้ switch provider (ใช้ `useRef` guard init)

### 3. Agents (`/agents`)
- รายการ agents ทั้งหมด พร้อม users badge + Telegram bot bindings (grid 3 คอลัมน์)
- เพิ่ม agent — ระบุ **Agent ID** + **Access Mode** (admin/sales/purchase/stock/general) → server auto-generate `SOUL.md` จาก template ตาม mode
- **Guard ลบตัวสุดท้าย** — ต้องมีอย่างน้อย 1 agent
- **Block duplicate Agent ID**
- ลบ agent — ใช้ **Dialog** พร้อม warning ถ้า bot ยังผูกอยู่
- ปุ่ม Delete แยกออกจากปุ่ม Edit (ghost style ด้านล่าง card)

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
  - Dropdown ผูก Agent + **warning ถ้ายังไม่ได้ผูก** (bot จะ fallback ไป default agent) — เลือก agent ซ้ำกันได้
  - Bot Token — Show/Hide, **Save แยกต่อ bot** (แก้ shared isPending bug)
  - DM Policy: **open** (ค่าเริ่มต้น) / **allowlist** เท่านั้น
  - Warning + link นำทาง ถ้าเลือก allowlist แต่ยังไม่มี user
  - Users ที่อนุญาต — read-only badges (กรอง `"*"` ออก), link ไปหน้า Agent
  - ปุ่ม **Set as Default** → เปิด Dialog (validate ห้ามชื่อซ้ำ/ห้าม `default`) + **restart gateway**
  - ปุ่ม **Delete Bot** → เปิด Dialog (ซ่อนสำหรับ default), ลบ config โดยตรง (ไม่ใช้ CLI)

### 7. LINE Official Account (`/line`)

- **How it works card** — อธิบายขั้นตอน cloudflared + LINE Console
- **เพิ่ม OA** — ระบุ OA ID, Channel Access Token, Channel Secret, **webhookPath** (เช่น `/line/webhook/sale`)
- **OA cards** แต่ละ account (grid 2 คอลัมน์):
  - ชื่อ bot จาก LINE API (`getProfile`)
  - Dropdown ผูก Agent
  - แสดง Webhook URL: `<tunnel-url>/line/webhook/<id>` สำหรับตั้งใน LINE Console
  - DM Policy: **open** (ตอบทุกคน) / **allowlist**
  - ปุ่ม Delete + QR pairing approve
- **หมายเหตุ**: ต้องมี cloudflared สำหรับ HTTPS public URL ก่อนตั้ง webhook
- **webhookPath ต้องไม่ซ้ำกัน** — ถ้าซ้ำ account ที่ start ทีหลังจะ override handler ทำให้ account แรกได้ 401

### 8. Logs (`/logs`)
- Live polling ทุก 3 วินาที
- Filter level: ALL / INFO / WARN / ERROR / DEBUG
- ค้นหา message / subsystem
- Pause / Resume, Auto scroll

### 9. User Guide (`/guide`)

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
- Roles: **superadmin** / **admin** / **chat** (ไม่มี viewer แล้ว)

### 13. Monitor (`/monitor`)

- **Overview bar**: session cards เรียงแนวนอน scroll ได้ — แต่ละ card แสดง agent, channel, user, state, elapsed, last message preview
- กด card เพื่อ focus session นั้นในรายการ detail ด้านล่าง
- **Detail panel**: global event stream (ทุก session) หรือเฉพาะ session ที่เลือก
- Filter: text search + state pills (thinking/tool/replied/error) + auto-scroll
- Insight pills: agents, active, avg response, longest, errors
- Duration badge บน reply rows: 🟢 <5s / 🟡 5-15s / 🔴 >15s
- Live row glow animation สำหรับ thinking/tool_call events
- Event columns: `เวลาไทย | agent·ch | user | type | ข้อความ | duration`

### 14. Compaction (`/compaction`)

- ตั้งค่า Auto-compact ของ OpenClaw: mode (safeguard/default/off), maxHistoryShare, keepRecentTokens, recentTurnsPreserve, softThresholdTokens
- คำอธิบาย compaction แต่ละ parameter
- Save + Restart Gateway buttons

### 15. Analysis (`/analysis`)

- Overview cards: จำนวน Agents, Telegram Users, Members, Webchat Rooms
- **Agents & Telegram**: ต่อ agent — sessions, tokens, top users
- **Webchat**: per-room cards พร้อม policy, agent info
- **Members**: จัดกลุ่มตาม role + สถานะ active
- **System Logs**: นับ ERROR/WARN/INFO/DEBUG + ตาราง error ล่าสุด

---

### 12. Webchat (`/webchat`)

- **role=admin/superadmin**: layout 2 คอลัมน์ — room list ซ้าย + chat ขวา
  - เพิ่ม/แก้ไข/ลบห้องแชท (Dialog)
  - กำหนด Policy: **open** (ทุกคน) / **allowlist** (เฉพาะที่กำหนด)
  - Allowlist inline — เพิ่ม/ลบ user ใน header bar
  - เปลี่ยน Policy ได้ทันทีจาก Select ใน header
- **role=chat**: เห็นเฉพาะหน้า Webchat — แสดงชื่อห้อง, เลือกห้อง (ถ้ามีหลายห้อง)
- Optimistic messages — ข้อความขึ้นทันทีก่อน AI ตอบ
- Strip `[[ reply_to_current]]` artifact จาก gateway
- Chat history เก็บใน PostgreSQL (`webchat_messages` table)
- ส่งข้อความผ่าน openclaw Hooks API (`POST /hooks/agent`) + poll response จาก `.jsonl` files

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
| GET | `/api/telegram/botinfo` | ชื่อ bot จริงจาก Telegram API |
| GET | `/api/telegram/bindings` | route bindings (bot → agent) |
| PUT | `/api/telegram/bindings` | set route binding |
| POST | `/api/telegram/accounts` | เพิ่ม bot account ใหม่ |
| DELETE | `/api/telegram/accounts/:id` | ลบ bot account |
| POST | `/api/telegram/set-default` | สลับ bot ขึ้นเป็น default |
| POST | `/api/telegram/approve` | approve pairing code (ยังมีใน server แต่ไม่มีใน UI แล้ว) |
| GET | `/api/line` | อ่าน LINE config (channels.line) |
| GET | `/api/line/botinfo` | ชื่อ bot จาก LINE API ต่อ account |
| GET | `/api/line/bindings` | route bindings (OA → agent) |
| PUT | `/api/line/bindings` | set route binding |
| POST | `/api/line/accounts` | เพิ่ม LINE OA (accountId, channelAccessToken, channelSecret, webhookPath) |
| DELETE | `/api/line/accounts/:id` | ลบ LINE OA |
| GET | `/api/line/pending` | รายการรอ pairing (QR scan) |
| POST | `/api/line/approve` | approve pairing code (LINE) |
| GET | `/api/doctor/status` | เช็ค config valid/invalid + ดึง problems |
| POST | `/api/doctor/fix` | รัน `openclaw doctor --fix` |
| GET | `/api/members` | รายการ admin_users (ต้องการ DATABASE_URL) |
| POST | `/api/members` | เพิ่ม admin user ใหม่ (bcrypt password) |
| PATCH | `/api/members/:id` | แก้ role / display_name / is_active / password |
| DELETE | `/api/members/:id` | ลบ admin user (ห้ามลบ superadmin คนสุดท้าย) |
| GET | `/api/webchat/rooms` | list rooms (กรอง policy=allowlist ตาม ?username=) |
| POST | `/api/webchat/rooms` | สร้าง room ใหม่ |
| PUT | `/api/webchat/rooms/:id` | แก้ display_name / policy |
| DELETE | `/api/webchat/rooms/:id` | ลบ room + messages |
| POST | `/api/webchat/rooms/:id/users` | เพิ่ม user ใน allowlist |
| DELETE | `/api/webchat/rooms/:id/users/:username` | ลบ user จาก allowlist |
| GET | `/api/webchat/history/:roomId` | ดึง messages ของ user ใน room |
| POST | `/api/webchat/send` | ส่งข้อความ → hooks → poll response → บันทึก PostgreSQL |
| GET | `/api/webchat/chat-users` | list users ที่มี role=chat |
| GET | `/api/monitor/events` | real-time session state ทุก agent/channel — อ่าน .jsonl last 50 lines, กรอง deleted rooms + stale sessions (>3 วัน) |

---

## Config Structure ปัจจุบัน (OpenClaw v2026.3.28+)

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
  "channels": {
    "telegram": { "..." : "..." },
    "line": {
      "enabled": true,
      "dmPolicy": "open",
      "channelAccessToken": "...",
      "channelSecret": "...",
      "webhookPath": "/line/webhook/sale",
      "accounts": {
        "stock": {
          "channelAccessToken": "...",
          "channelSecret": "...",
          "webhookPath": "/line/webhook/stock",
          "dmPolicy": "open"
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
- **role=chat**: login แล้ว redirect `/webchat` ทันที — proxy.ts กั้น route อื่นทั้งหมด — ไม่มี sidebar เมนู
- **LINE webhookPath ต้องไม่ซ้ำกัน**: `registerPluginHttpRoute` ใน openclaw-gateway ใช้ `replaceExisting:true` — ถ้า 2 OA ใช้ path เดียวกัน OA ที่ start ทีหลัง override handler → OA แรกได้ 401
- **LINE session key**: `agent:<agentId>:line:direct:<lineUserId>` เช่น `agent:sale:line:direct:u6490df71c89c6db1b51c7084b46055ef`
- **LINE dmPolicy**: ใช้ `open` เท่านั้น — ไม่ต้อง pairing
- **cloudflared**: LINE webhook ต้องการ HTTPS public URL — ใช้ cloudflared expose port 18789 (openclaw-gateway) ดู INSTALL.md ขั้นตอน 11.9
- **LINE Console**: Webhook URL per OA เช่น `https://<tunnel>.trycloudflare.com/line/webhook/sale` — ต้อง verify + enable ใน LINE Console
- **Sidebar เมนู (admin/superadmin)**: Dashboard, Model, Agents, Telegram, **LINE**, Webchat, **Monitor**, Analysis, Logs, **Compaction**, คู่มือ, สมาชิก
- **Webchat Hooks**: ต้องเปิด `hooks.enabled=true` + `hooks.token` + `hooks.allowRequestSessionKey=true` ใน `~/.openclaw/openclaw.json` — token เก็บใน `~/openclaw-api/.env` เป็น `HOOKS_TOKEN`
- **Webchat poll**: HTTP `/sessions/{key}/history` ต้องการ auth แบบอื่น — ใช้วิธีอ่าน `~/.openclaw/agents/{agentId}/sessions/sessions.json` + `.jsonl` โดยตรงแทน
- **Webchat session key**: gateway สร้าง key เป็น `agent:{agentId}:hook:webchat:{username}` — ต้อง lookup จาก `sessions.json` ด้วย full key
- **PostgreSQL constraint**: `admin_users_role_check` ต้องแก้ manual หลัง deploy ครั้งแรก: `ALTER TABLE admin_users DROP CONSTRAINT admin_users_role_check; ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('superadmin', 'admin', 'chat'));`
