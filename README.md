# OpenClaw Admin

Web Admin Panel สำหรับจัดการ OpenClaw ERP Chatbot — ไม่ต้อง SSH server

รองรับ **OpenClaw v2026.3.28+**

## โครงสร้างระบบ

```text
Browser (port 3000)
    │ HTTPS — JWT Cookie
    ▼
openclaw-admin  ← Next.js 16 (Docker container)
    │ HTTP REST — Bearer token — port 4000
    ▼
openclaw-api    ← Express.js (pm2 บน host)
    │
    ├── ~/.openclaw/openclaw.json
    ├── ~/.openclaw/workspace-*/SOUL.md
    ├── ~/.openclaw/workspace-*/config/mcporter.json
    └── openclaw CLI (gateway restart, doctor)

openclaw-gateway ← systemd service (แยกต่างหาก)

PostgreSQL 16  ← Docker container (port 5432)
    └── admin_users, webchat_rooms, webchat_messages
```

> **openclaw-api** รันบน host ด้วย pm2 (ไม่ใช่ Docker) เพราะต้องการ systemd สำหรับ `openclaw gateway restart`
> ดูที่ repo แยก: [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api)

## Stack

| ส่วน | Technology |
| ---- | ---------- |
| Framework | Next.js 16.2 + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Data Fetching | TanStack Query v5 |
| HTTP | axios |
| Auth | JWT HttpOnly Cookie + PostgreSQL 16 |
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
| Dashboard | `/` | สถานะ Gateway, Doctor, สรุปจำนวน Agent/Member, ปุ่ม Restart |
| Model | `/model` | ตั้งค่า API Key (OpenRouter, Anthropic, OpenAI, Gemini, Mistral, Groq) + ทดสอบ connection |
| Agents | `/agents` | จัดการ Agent — เพิ่ม/ลบ, ตั้ง Access Mode |
| Agent Detail | `/agents/[id]` | แก้ SOUL.md, จัดการ Telegram Users (whitelist), ตั้งค่า MCP (URL + Access Mode + Test) |
| Agent Chat | `/agents/[id]/chat` | ดู chat history ของ agent นั้นๆ |
| Telegram | `/telegram` | เพิ่ม/ลบ Bot (พร้อม token format validation) |
| Webchat | `/webchat` | ใช้งาน webchat ในหน้าเดียว (role: chat ใช้ได้) |
| Chats | `/chats` | ดู Telegram chat history ทุก session + ข้อความ |
| Monitor | `/monitor` | Live session event log (auto-refresh) |
| Compaction | `/compaction` | ตั้งค่า memory compaction (รองรับ fields ใหม่ v2026.3.28) |
| Analysis | `/analysis` | วิเคราะห์ token usage + สถิติรายงาน per agent |
| Logs | `/logs` | Live gateway logs (เลือก 100 / 300 / 1000 บรรทัด) |
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
│   │   ├── agents/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── chat/page.tsx
│   │   ├── telegram/page.tsx
│   │   ├── webchat/page.tsx
│   │   ├── chats/page.tsx
│   │   ├── monitor/page.tsx
│   │   ├── compaction/page.tsx
│   │   ├── analysis/page.tsx
│   │   ├── logs/page.tsx
│   │   ├── guide/page.tsx
│   │   └── members/
│   │       ├── page.tsx            ← Server component (ส่ง currentUserId)
│   │       └── members-content.tsx ← Client component
│   ├── actions/auth.ts             ← login / logout server actions
│   └── login/page.tsx
│
├── components/
│   ├── sidebar.tsx                 ← Navigation (role-aware)
│   ├── query-provider.tsx
│   └── ui/                         ← shadcn/ui components
│
├── lib/
│   ├── api.ts                      ← axios + types + API functions
│   ├── db.ts                       ← postgres client
│   ├── session.ts                  ← JWT cookie helpers
│   └── utils.ts
│
├── db/init.sql                     ← PostgreSQL schema
├── Dockerfile
├── docker-compose.yml
├── proxy.ts                        ← Next.js middleware (auth guard)
└── next.config.ts
```

---

## Deploy บน Server

### ความต้องการ

- Docker + Docker Compose
- **openclaw-api รันด้วย pm2 บน host อยู่แล้ว** (port 4000)
- **OpenClaw Gateway v2026.3.28+**

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
API_TOKEN=your-api-token           # ต้องตรงกับ openclaw-api
SERVER_IP=192.168.2.109            # IP ของ server นี้
POSTGRES_PASSWORD=your-db-password
SESSION_SECRET=your-random-secret  # สุ่ม string ยาวๆ
```

### 4. รัน

```bash
docker compose up -d --build
```

เข้าใช้งานได้ที่ `http://<SERVER_IP>:3000`

> ระบบสร้าง PostgreSQL และตาราง `admin_users` ให้อัตโนมัติ
> ต้องสร้าง superadmin user แรกผ่าน `docker exec` หรือ `psql` โดยตรง

### อัปเดต (ครั้งถัดไป)

```bash
cd ~/openclaw-admin
git pull
docker compose up -d --build
```

---

## Development (Local)

```bash
cp .env.example .env.local
# แก้ค่า NEXT_PUBLIC_API_URL, NEXT_PUBLIC_API_TOKEN, DATABASE_URL, SESSION_SECRET

npm install
npm run dev
```

---

## Related Repos

| Repo | Description |
| ---- | ----------- |
| [bosocmputer/openclaw-admin](https://github.com/bosocmputer/openclaw-admin) | Web UI (repo นี้) |
| [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api) | Express API server (รันบน host) |
