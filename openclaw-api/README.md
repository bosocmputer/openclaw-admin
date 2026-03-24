# OpenClaw Admin API

Express.js REST API สำหรับ [openclaw-admin](https://github.com/openclaw/openclaw-admin) ทำงานบน server เดียวกับ OpenClaw

---

## ติดตั้ง

```bash
mkdir -p ~/openclaw-api && cd ~/openclaw-api
npm init -y
npm install express cors dotenv
```

Copy `index.js` จากไฟล์นี้ไปที่ `~/openclaw-api/index.js`

สร้าง `.env`:

```bash
cat > .env << 'EOF'
PORT=4000
API_TOKEN=<สร้าง-random-token>
EOF
```

Start:

```bash
nohup node ~/openclaw-api/index.js > /tmp/openclaw-api.log 2>&1 &
```

ทดสอบ:

```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:4000/api/status
# {"gateway":"online"}
```

---

## Endpoints

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | เช็ค gateway online/offline |
| GET | `/api/gateway/logs?lines=50` | ดู gateway log |
| POST | `/api/gateway/restart` | restart gateway |

### Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | อ่าน openclaw.json ทั้งหมด |
| PUT | `/api/config` | เขียน openclaw.json |
| GET | `/api/model` | อ่าน model ปัจจุบัน |
| PUT | `/api/model` | เปลี่ยน model |
| GET | `/api/models` | ดึง model list จาก OpenRouter |
| GET | `/api/telegram` | อ่าน telegram config |
| PUT | `/api/telegram` | แก้ telegram config |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | รายการ agents ทั้งหมด + soul + mcp + users |
| POST | `/api/agents` | เพิ่ม agent ใหม่ |
| DELETE | `/api/agents/:id` | ลบ agent |
| GET | `/api/agents/:id/soul` | อ่าน SOUL.md |
| PUT | `/api/agents/:id/soul` | เขียน SOUL.md |
| GET | `/api/agents/:id/mcp` | อ่าน mcporter.json |
| PUT | `/api/agents/:id/mcp` | เขียน mcporter.json |
| GET | `/api/agents/:id/users` | รายการ Telegram user IDs |
| POST | `/api/agents/:id/users` | เพิ่ม user `{ userId: "123456" }` |
| DELETE | `/api/agents/:id/users/:userId` | ลบ user |

---

## Auth

ทุก request ต้องส่ง header:

```
Authorization: Bearer <API_TOKEN>
```

---

## ใช้กับ Next.js (openclaw-admin)

ตั้ง env ใน Next.js:

```
NEXT_PUBLIC_API_URL=http://192.168.x.x:4000
NEXT_PUBLIC_API_TOKEN=<token>
```

ตัวอย่าง fetch:

```ts
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agents`, {
  headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}` }
})
const agents = await res.json()
```

---

## ไฟล์ที่ API อ่าน/เขียน

| ไฟล์ | Endpoint |
|------|----------|
| `~/.openclaw/openclaw.json` | `/api/config`, `/api/model`, `/api/telegram`, `/api/agents`, `/api/agents/:id/users` |
| `~/.openclaw/workspace-<id>/SOUL.md` | `/api/agents/:id/soul` |
| `~/.openclaw/workspace-<id>/config/mcporter.json` | `/api/agents/:id/mcp` |
| `/tmp/openclaw-gateway.log` | `/api/gateway/logs` |
