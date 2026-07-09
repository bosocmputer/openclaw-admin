# OpenClaw Admin

Web Admin Panel สำหรับจัดการ OpenClaw ERP Chatbot — ไม่ต้อง SSH server

รองรับ **OpenClaw ERP Runtime Overlay release 2026.6.11**

## Release Status ล่าสุด

| ส่วน | Baseline |
| ---- | -------- |
| Runtime overlay release | `2026.6.11-erp-20260706-line-burst-fastpath` |
| Runtime overlay | `openclaw-runtime-2026.6.11-erp-line-burst-fe432925.tgz` |
| Runtime overlay SHA256 | `a26156d0440b4d6010d89c98a94cdefa8f0d51693762874bde0d607175f94a99` |
| Runtime source commits | `f608a18664`, `9976b9bbd7`, `fe432925eb` |
| openclaw-api | `b32f1f0` หรือใหม่กว่า |
| openclaw-admin | `adba0bb` หรือใหม่กว่า |

> Runtime target path คือ `/root/openclaw-runtime-2026.6.11-erp/dist/index.js`. Production ปัจจุบันควรใช้ base runtime 2026.6.11 จริง โดย `node ... --version` แสดง `OpenClaw 2026.6.11 (fe43292)` หรือใหม่กว่า. Overlay-only บน skeleton 2026.6.8 เป็น legacy LINE-only emergency path และไม่พอสำหรับ provider ใหม่อย่าง `ollama-cloud`.

พฤติกรรมสำคัญ:

- `/system` มี Production Readiness gate สำหรับตรวจ runtime version, PM2 gateway path, API/Admin commit, PostgreSQL และ legacy memory ก่อน update ลูกค้า
- LINE รวมรูปกับข้อความที่ user ส่งตามมาเร็ว ๆ เป็น turn เดียวแบบ generic โดยไม่ hardcode keyword ธุรกิจ
- LINE ข้อความธรรมดาเดี่ยว ๆ ไม่ถูก delay และ `/reset` bypass การรวมข้อความ
- `/monitor` และ `/analysis/conversations` รองรับ media preview เมื่อ runtime มี managed media ref
- `/analysis/conversations` ใช้เก็บ feedback จริงเพื่อปรับ Business Profile, SOUL, MCP/Search และ Memory Learning
- Runtime ต้องรันจาก ERP runtime path เช่น `/root/openclaw-runtime-2026.6.11-erp/dist/index.js` ไม่ใช่ global `openclaw`
- ถ้า LINE coalescing มีปัญหา สามารถ rollback เฉพาะ feature ด้วย `OPENCLAW_LINE_COALESCING=0` แล้ว restart gateway

## โครงสร้างระบบ

```text
Browser (port 3000)
    │ HTTPS — JWT Cookie
    ▼
openclaw-admin  ← Next.js 16 (Docker container)
    │ HTTP REST — Bearer token — port 4000
    │ (ผ่าน /api/proxy — token ไม่หลุดไป browser)
    ▼
openclaw-api    ← Express.js (pm2 บน host)
    │
    ├── ~/.openclaw/openclaw.json
    ├── ~/.openclaw/workspace-*/SOUL.md
    ├── ~/.openclaw/openclaw.json mcp.servers
    └── openclaw CLI / ERP runtime helpers
        (gateway restart, doctor, model runtime test)

openclaw-gateway ← pm2 + ERP runtime overlay (port 18789)

PostgreSQL 16  ← Docker container (port 5432)
    └── admin_users, webchat_*, audit_logs,
        conversation_turns/events/exports,
        business_profiles, memory_learning_candidates
```

> **openclaw-api** รันบน host ด้วย pm2 (ไม่ใช้ Docker) เพราะต้องเข้าถึง OpenClaw runtime, config และ workspace files
> **openclaw-gateway** production ควรรันผ่าน pm2 จาก ERP runtime overlay เช่น `/root/openclaw-runtime-2026.6.11-erp/dist/index.js` เพื่อให้ behavior ตรงกับ dev server และ customer rollout
> ดูที่ repo แยก: [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api)

## Security Architecture

API token **ไม่เคยส่งไป browser** — ทุก request จาก client ผ่าน Next.js server proxy:

```text
Browser → GET /api/proxy/api/status
              ↓ (server-side, ใส่ Bearer token ที่นี่)
          fetch http://openclaw-api:4000/api/status
```

- `API_TOKEN` และ `API_URL` เป็น server-only env var (ไม่มี `NEXT_PUBLIC_`)
- Proxy route ตรวจ session ก่อนทุก request — ถ้าไม่มี session ตอบ 401 ทันที

## Stack

| ส่วน | Technology |
| ---- | ---------- |
| Framework | Next.js 16.2 + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Data Fetching | TanStack Query v5 |
| HTTP | axios (baseURL: `/api/proxy`) |
| Auth | JWT HttpOnly Cookie (8h) + bcrypt + rate limiting |
| Audit | audit_logs table — บันทึก login/logout/failed |
| Deploy | Docker Compose (2 containers) |

## Roles

| Role | สิทธิ์ |
| ---- | ------ |
| `superadmin` | ทุกหน้า รวมถึง Members management |
| `admin` | ทุกหน้า ยกเว้น Members |
| `chat` | Webchat เท่านั้น |

## หน้าต่างๆ

| หน้า | URL | คำอธิบาย |
| ---- | --- | --------- |
| Dashboard | `/` | Operations dashboard: health, runtime, channel, latency, token/cost, recent turns และ next actions |
| Model & Keys | `/model` | ตั้ง Provider Keys, เลือก Model ข้อความ, Model สำรอง, ทดสอบข้อความผ่าน runtime จริง และทดสอบอ่านรูปสินค้าแบบ optional |
| Business Profiles | `/business-profiles` | กำหนดบริบทธุรกิจแบบ bounded แล้วให้ Agent Load Template เพิ่มเข้า SOUL.md โดย admin ยืนยันเอง |
| Agents | `/agents` | จัดการ Agent — เพิ่ม/ลบ, ตั้ง Access Mode |
| Agent Detail | `/agents/[id]` | แก้ SOUL.md, จัดการ Telegram Users (whitelist), ตั้งค่า MCP (URL + Access Mode + Test) |
| Agent Chat | `/agents/[id]/chat` | ดู chat history ของ agent นั้นๆ |
| Telegram | `/telegram` | เพิ่ม/ลบ Bot (พร้อม token format validation) |
| LINE OA | `/line` | จัดการ LINE Official Account — multi-OA, webhookPath ต่อ OA, QR pairing, agent binding |
| Webchat | `/webchat` | ใช้งาน webchat ในหน้าเดียว (role: chat ใช้ได้) |
| Monitor | `/monitor` | Live session event log (auto-refresh) — รองรับ Telegram, LINE, Webchat |
| Compaction | `/compaction` | ตั้งค่า memory compaction (รองรับ fields ใหม่ v2026.3.28) |
| Checkpoints | `/sessions` | ดูและ restore session compaction checkpoints ต่อ agent |
| Webhooks | `/webhooks` | CRUD webhook routes สำหรับรับข้อมูลจากระบบภายนอก |
| Agent Brain | `/memory` | คุม Active Knowledge, Search Hints, SML Description Suggestions, Blocked/Deleted memory, Sources, policy และ compatibility `MEMORY.md`/`DREAMS.md` |
| Analysis | `/analysis` | วิเคราะห์ usage/operational metrics |
| Conversation Analysis | `/analysis/conversations` | ดูประวัติบทสนทนา, issue tags, trace/tool/model/media detail, Agent Brain evidence และ export pack |
| Logs | `/logs` | Live gateway logs (เลือก 100 / 300 / 1000 บรรทัด) |
| System Check | `/system` | Self-service health + Production Readiness gate: runtime/process/git/memory checks, safe actions, copy customer update command และ copy support bundle |
| Guide | `/guide` | คู่มือผู้ใช้ (แสดง bot name จริงจาก config) |
| Members | `/members` | จัดการผู้ใช้ระบบ (superadmin เท่านั้น) |

## โครงสร้าง Repo

```text
openclaw-admin/
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx              ← Auth guard + Sidebar
│   │   ├── page.tsx                ← Dashboard
│   │   ├── model/page.tsx
│   │   ├── business-profiles/page.tsx
│   │   ├── agents/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── chat/page.tsx
│   │   ├── telegram/page.tsx
│   │   ├── line/page.tsx
│   │   ├── webchat/page.tsx
│   │   ├── monitor/page.tsx
│   │   ├── compaction/page.tsx
│   │   ├── sessions/page.tsx       ← Session Checkpoints
│   │   ├── webhooks/page.tsx       ← Webhooks CRUD
│   │   ├── memory/page.tsx         ← Memory Learning + Review Queue + file viewer
│   │   ├── analysis/page.tsx
│   │   ├── analysis/conversations/ ← Conversation history + export + learning candidate bridge
│   │   ├── logs/page.tsx
│   │   ├── guide/page.tsx
│   │   └── members/
│   │       ├── page.tsx            ← Server component (ส่ง currentUserId)
│   │       └── members-content.tsx ← Client component
│   ├── api/
│   │   └── proxy/[...path]/route.ts ← Server-side API proxy (ซ่อน token)
│   ├── actions/auth.ts             ← login / logout server actions
│   └── login/page.tsx
│
├── components/
│   ├── sidebar.tsx                 ← Navigation (role-aware)
│   ├── query-provider.tsx
│   └── ui/                         ← shadcn/ui components
│
├── lib/
│   ├── api.ts                      ← axios client (baseURL: /api/proxy)
│   ├── audit.ts                    ← Audit log helper
│   ├── db.ts                       ← postgres client (pool: 20)
│   ├── rate-limit.ts               ← Login rate limiter (in-memory)
│   ├── session.ts                  ← JWT cookie (8h + sliding window)
│   └── utils.ts
│
├── db/init.sql                     ← PostgreSQL schema + indexes
├── Dockerfile
├── docker-compose.yml
└── next.config.ts
```

---

## Deploy บน Server

### ความต้องการ

- Docker + Docker Compose
- **openclaw-api รันด้วย pm2 บน host อยู่แล้ว** (port 4000)
- **OpenClaw Gateway v2026.6.11** ผ่าน **OpenClaw ERP Runtime Overlay**
- **cloudflared** — สำหรับ LINE webhook (LINE ต้องการ HTTPS): ดู INSTALL.md ขั้นตอน 11.9

### 1. ติดตั้ง Docker (ครั้งแรกเท่านั้น)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# logout แล้ว login ใหม่
```

### 2. Clone repo

```bash
git clone https://github.com/bosocmputer/openclaw-admin.git ~/openclaw-admin
cd ~/openclaw-admin
```

### 3. สร้าง .env

```bash
cp .env.example .env
nano .env
```

ค่าที่ต้องแก้ใน `.env`:

```env
SERVER_IP=192.168.2.109            # IP ของ server นี้
API_TOKEN=your-api-token           # ต้องตรงกับ openclaw-api
API_URL=http://192.168.2.109:4000  # URL ของ openclaw-api (server-to-server)
POSTGRES_PASSWORD=your-db-password
SESSION_SECRET=your-random-secret  # สร้างด้วย: openssl rand -base64 32
```

> ⚠️ ไม่มี `NEXT_PUBLIC_API_TOKEN` อีกต่อไป — ใช้ `API_TOKEN` (server-only) แทน

### 4. รัน

```bash
docker compose up -d --build
```

เข้าใช้งานได้ที่ `http://<SERVER_IP>:3000`

> ระบบสร้าง PostgreSQL และตาราง `admin_users` ให้อัตโนมัติตอน container แรกขึ้น

### อัปเดต (ครั้งถัดไป)

```bash
cd ~/openclaw-admin
git pull --ff-only origin main
docker compose build openclaw-admin
docker compose up -d openclaw-admin
docker compose ps
```

### Operational Status (2026-07-06)

- Dev server `192.168.2.109` is current on OpenClaw v2026.6.11 ERP runtime overlay.
- Customer rollout path for `chang168` is current through `openclaw-api` + `openclaw-admin`; gateway remains pm2 + ERP runtime overlay.
- `/analysis/conversations` supports triage, media preview, export for Codex, Agent Brain decisions, search hints, and SML description suggestion evidence.
- `/memory` is the Agent Brain Control Center: Active Knowledge is used as safe context, Search Hints help MCP/Search, Description Suggestions guide staff to improve SML ERP `description`, Sources are evidence only, and Blocked/Deleted keeps tombstones.
- `/line` and `/telegram` include Agent Brain audience policy per account. Default is `customer`, and SML description suggestions are hidden unless a channel is explicitly `staff` or `internal`.
- Current operating mode: strict default-deny safe auto-learn plus generic hardening. Dynamic ERP facts such as price, stock, cost, availability, credit, and substitute products must still come from MCP/SML tools.

### Migration (ถ้า DB มีข้อมูลอยู่แล้ว)

`init.sql` จะไม่รันซ้ำบน DB ที่มีข้อมูลอยู่แล้ว ถ้า schema มีการเปลี่ยนแปลงต้องรันเอง:

```bash
docker compose exec postgres psql -U openclaw -d openclaw_admin -f /docker-entrypoint-initdb.d/init.sql
# หรือรัน SQL ตรงๆ เช่น เพิ่ม audit_logs:
docker compose exec postgres psql -U openclaw -d openclaw_admin -c "
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, actor VARCHAR(50) NOT NULL,
  action VARCHAR(60) NOT NULL, target TEXT, detail TEXT,
  ip VARCHAR(45), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);"
```

---

## Development (Local)

```bash
cp .env.example .env.local
# แก้ค่าใน .env.local:
#   API_URL=http://<server-ip>:4000
#   API_TOKEN=your-api-token
#   DATABASE_URL=postgresql://...
#   SESSION_SECRET=...

npm install
npm run dev
```

> ไม่ต้องตั้ง `NEXT_PUBLIC_*` อีกต่อไป — proxy route จัดการทั้งหมด

---

## Related Repos

| Repo | Description |
| ---- | ----------- |
| [bosocmputer/openclaw-admin](https://github.com/bosocmputer/openclaw-admin) | Web UI (repo นี้) |
| [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api) | Express API server (รันบน host) |
