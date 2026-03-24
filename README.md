# OpenClaw Admin

Web Admin Panel สำหรับจัดการ OpenClaw ERP Chatbot — ไม่ต้อง SSH server

## โครงสร้าง Repo

```text
openclaw-admin/
├── app/                        ← Next.js pages (Client Components)
│   ├── page.tsx                ← Dashboard
│   ├── model/page.tsx          ← Model & API Key settings
│   ├── agents/
│   │   ├── page.tsx            ← Agent list
│   │   └── [id]/
│   │       ├── page.tsx        ← Agent Detail (SOUL / Users / MCP)
│   │       └── chat/page.tsx   ← Chat Monitor
│   ├── telegram/page.tsx       ← Telegram Bot management
│   ├── chats/page.tsx          ← All chats
│   ├── logs/page.tsx           ← Live logs
│   └── guide/page.tsx          ← คู่มือผู้ใช้
│
├── components/
│   ├── sidebar.tsx             ← Navigation menu
│   ├── query-provider.tsx      ← TanStack Query provider
│   └── ui/                     ← shadcn/ui components
│
├── lib/
│   └── api.ts                  ← axios instance + TypeScript types + API functions
│
├── openclaw-api/               ← Express API server (รันบน server port 4000)
│   ├── index.js                ← API endpoints ทั้งหมด
│   ├── package.json
│   └── Dockerfile
│
├── Dockerfile                  ← Build openclaw-admin (Next.js standalone)
├── docker-compose.yml          ← รัน admin + api พร้อมกัน
├── .env.example                ← Template config สำหรับ server
└── next.config.ts
```

## System Architecture

```text
Browser (port 3000)
    │ HTTP (TanStack Query + axios)
    ▼
Next.js Admin (Docker container)
    │ HTTP REST — Bearer token
    ▼
Express API (Docker container port 4000)
    │
    ├── ~/.openclaw/openclaw.json    ← config หลัก
    ├── ~/.openclaw/workspace-*/
    │   ├── SOUL.md                  ← system prompt ของแต่ละ agent
    │   └── config/mcporter.json     ← MCP config
    └── openclaw CLI                 ← gateway restart, doctor
```

## Stack

| ส่วน | Technology |
| ---- | ---------- |
| Framework | Next.js + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Data | TanStack Query v5 |
| HTTP | axios |
| API Server | Express.js |
| Deploy | Docker Compose |

---

## Deploy บน Server

### ความต้องการ

- Docker + Docker Compose
- OpenClaw ติดตั้งแล้ว (openclaw-gateway รันเป็น systemd)

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
API_TOKEN=sml-openclaw-2026        # token สำหรับ authenticate
SERVER_IP=192.168.2.109            # IP ของ server นี้
OPENCLAW_HOME=/home/bosscatdog     # home directory ที่มี .openclaw/
```

### 4. รัน

```bash
docker compose up -d
```

เข้าใช้งานได้ที่ `http://192.168.2.109:3000`

---

### อัปเดต (ครั้งถัดไป)

```bash
cd ~/openclaw-admin
git pull
docker compose up --build -d
```

---

## Development (Local)

```bash
# สร้าง .env.local
cp .env.example .env.local
# แก้ค่า NEXT_PUBLIC_API_URL และ NEXT_PUBLIC_API_TOKEN

npm install
npm run dev
```

---

## หมายเหตุสำคัญ

- **openclaw-gateway** รันเป็น systemd แยกต่างหาก — ไม่อยู่ใน Docker เพราะต้องอ่าน `~/.openclaw/` โดยตรง
- **openclaw-api** mount `~/.openclaw/` และ `openclaw` / `mcporter` binary เข้า container
- **`.env`** ห้าม commit — มี secret อยู่
- ทุกครั้งที่แก้ `openclaw-api/index.js` ต้อง `docker compose up --build -d` ใหม่
