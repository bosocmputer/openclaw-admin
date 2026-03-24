# OpenClaw Admin

Web Admin Panel สำหรับจัดการ OpenClaw ERP Chatbot — ไม่ต้อง SSH server

## โครงสร้างระบบ

```text
Browser (port 3000)
    │ HTTP (TanStack Query + axios)
    ▼
openclaw-admin  ← Next.js (Docker container)
    │ HTTP REST — Bearer token — port 4000
    ▼
openclaw-api    ← Express.js (pm2 บน host)
    │
    ├── ~/.openclaw/openclaw.json
    ├── ~/.openclaw/workspace-*/SOUL.md
    ├── ~/.openclaw/workspace-*/config/mcporter.json
    └── openclaw CLI (gateway restart, doctor)

openclaw-gateway ← systemd service (แยกต่างหาก)
```

> **openclaw-api** รันบน host ด้วย pm2 (ไม่ใช่ Docker) เพราะต้องการ systemd สำหรับ `openclaw gateway restart`
> ดูที่ repo แยก: [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api)

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
├── Dockerfile                  ← Build Next.js standalone
├── docker-compose.yml          ← รัน admin container
├── .env.example                ← Template config
└── next.config.ts
```

## Stack

| ส่วน | Technology |
| ---- | ---------- |
| Framework | Next.js + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Data | TanStack Query v5 |
| HTTP | axios |
| Deploy | Docker |

---

## Deploy บน Server

### ความต้องการ

- Docker
- **openclaw-api รันด้วย pm2 บน host อยู่แล้ว** (port 4000)

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
API_TOKEN=sml-openclaw-2026        # ต้องตรงกับ openclaw-api
SERVER_IP=192.168.2.109            # IP ของ server นี้
```

### 4. รัน

```bash
docker compose up -d --build
```

เข้าใช้งานได้ที่ `http://192.168.2.109:3000`

---

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
# แก้ค่า NEXT_PUBLIC_API_URL และ NEXT_PUBLIC_API_TOKEN

npm install
npm run dev
```

---

## Related Repos

| Repo | Description |
| ---- | ----------- |
| [bosocmputer/openclaw-admin](https://github.com/bosocmputer/openclaw-admin) | Web UI (repo นี้) |
| [bosocmputer/openclaw-api](https://github.com/bosocmputer/openclaw-api) | Express API server (รันบน host) |
