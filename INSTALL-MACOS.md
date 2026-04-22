# คู่มือติดตั้ง OpenClaw Admin System บน macOS

> ดัดแปลงจาก INSTALL.md สำหรับ macOS โดยเฉพาะ  
> ทดสอบกับ macOS Monterey (12.x) / Intel Mac

---

## ข้อจำกัดสำคัญก่อนเริ่ม

| หัวข้อ | รายละเอียด |
|--------|-----------|
| **Docker Desktop** | macOS ต้องใช้ Docker Desktop (ไม่ใช่ CLI script เหมือน Linux) — ใช้ RAM เพิ่มจาก VM layer ประมาณ 1–2 GB |
| **systemd ไม่มีบน macOS** | `pm2 startup` บน macOS ใช้ launchd แทน — คำสั่งที่ได้จะต่างจากตัวอย่างใน INSTALL.md |
| **`openclaw gateway install`** | ใช้ systemd — **ใช้ไม่ได้บน macOS** ต้องใช้ pm2 แทน |
| **cloudflared binary** | ต้องดาวน์โหลด binary สำหรับ macOS (ไม่ใช่ linux-amd64) |
| **PATH shell** | macOS ใช้ zsh เป็น default — ต้องแก้ `~/.zshrc` แทน `~/.bashrc` |
| **ufw ไม่มีบน macOS** | ข้ามขั้นตอน ufw ทั้งหมด — macOS ใช้ Application Firewall แทน |
| **`apt` ไม่มีบน macOS** | ใช้ Homebrew แทน |
| **ประสิทธิภาพ** | Docker บน Mac Intel ช้ากว่า native Linux เล็กน้อย ไม่มีผลต่อการใช้งานปกติ |

---

## ข้อมูลที่ต้องเตรียมก่อนเริ่ม

| ข้อมูล | ตัวอย่าง | หมายเหตุ |
|--------|---------|---------|
| IP address ของ Mac (ใน LAN) | `192.168.1.100` | ดูใน System Settings → Network |
| Telegram Bot Token | `123456:ABC-DEF...` | ขอจาก @BotFather |
| OpenRouter API Key | `sk-or-v1-...` | จาก openrouter.ai |
| MCP Server URL | `http://192.168.1.50:3001/sse` | ถามทีมที่ติดตั้ง MCP |
| รหัสผ่าน Admin | ตั้งเองได้ | สำหรับ login หน้าเว็บ |

---

## ภาพรวมระบบ

```
Browser (port 3000)
    │  HTTP — ผ่าน Next.js proxy → /api/proxy/*
    ▼
openclaw-admin (Docker, port 3000)   ← Next.js frontend + proxy
    │  Bearer token → http://host.docker.internal:4000
    ▼
openclaw-api (pm2, port 4000)        ← Express API บน host
    │  POST /hooks/agent → http://127.0.0.1:18789
    ▼
openclaw-gateway (port 18789)        ← agent runtime, LINE, Telegram
    │
    └── PostgreSQL (Docker, port 5432)   ← admin_users, webchat_*
```

> **หมายเหตุ**: บน macOS Docker container เข้าถึง host ผ่าน `host.docker.internal` แทน IP จริง — ไม่ต้องทำ firewall rule พิเศษ

---

## ขั้นตอนที่ 1 — ติดตั้ง Homebrew และ tools พื้นฐาน

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git
```

ตรวจสอบ:

```bash
git --version
```

---

## ขั้นตอนที่ 2 — ติดตั้ง Node.js 22+

```bash
brew install node@22
```

ถ้า `node` ไม่อยู่ใน PATH ให้เพิ่ม:

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

> **Intel Mac**: path จะเป็น `/usr/local/opt/node@22/bin` แทน `/opt/homebrew/opt/node@22/bin`

ตรวจสอบ:

```bash
node --version   # ต้องได้ v22.x.x ขึ้นไป
npm --version
```

---

## ขั้นตอนที่ 3 — ติดตั้ง Docker Desktop

1. ดาวน์โหลด **Docker Desktop for Mac (Intel)** จาก [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. ลากไปใส่ Applications แล้วเปิด
3. ทำตาม setup wizard จนเสร็จ

> **ข้อจำกัด**: Docker Desktop มี resource limit — แนะนำตั้งที่ Settings → Resources:
> - Memory: **8 GB** (ระบบต้องการประมาณ 3–4 GB)
> - CPU: 4 cores

ตรวจสอบ:

```bash
docker --version
docker compose version   # ต้องได้ v2.x.x
```

---

## ขั้นตอนที่ 4 — ตั้งค่า npm global path และติดตั้ง global packages

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

แล้วติดตั้ง:

```bash
npm install -g openclaw@2026.4.15 mcporter pm2
```

ตรวจสอบ:

```bash
openclaw --version
mcporter --version
pm2 --version
```

> **สำคัญ**: ถ้าเปิด terminal ใหม่แล้วหาคำสั่งไม่เจอ ให้รัน `source ~/.zshrc` อีกครั้ง

---

## ขั้นตอนที่ 5 — Generate tokens

สร้าง token 3 ตัว (ใช้ต่างกันทั้งหมด — ห้ามใช้ค่าตัวอย่างจากคู่มือนี้):

```bash
# HOOKS_TOKEN — ใช้ใน openclaw.json และ openclaw-api/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SESSION_SECRET — ใช้ใน openclaw-admin/.env
openssl rand -hex 32

# API_TOKEN — ใช้ใน openclaw-api/.env และ openclaw-admin/.env
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**จดค่าทั้งสามไว้** — จะใช้ในขั้นตอน 6.3, 7.2 และ 8.2

> **สำคัญ**: อย่าใช้ค่า `sml-openclaw-2026` จากตัวอย่างในคู่มือนี้เป็น API_TOKEN จริง — generate ใหม่ทุกครั้ง

---

## ขั้นตอนที่ 6 — ติดตั้ง openclaw-gateway

### 6.1 รัน onboard wizard

```bash
openclaw onboard
```

wizard จะถามเรื่อง model/provider — **เลือกอะไรก็ได้ แล้วกด Enter ผ่านจนจบ** อย่ากด Ctrl+C กลางคัน

คำสั่งนี้สร้าง `~/.openclaw/openclaw.json` และ config พื้นฐาน

> ค่าที่เลือกใน wizard แก้ได้ทั้งหมดผ่าน Web Admin ในขั้นตอนถัดไป

### 6.2 ตรวจสอบและ start gateway

```bash
openclaw gateway status
```

ถ้าเห็น `RPC probe: ok` — gateway รันอยู่แล้ว ไปขั้นตอน 6.3

ถ้า gateway ไม่รัน ให้รันด้วย pm2 (แนะนำ — auto-restart เมื่อ reboot):

```bash
pm2 start $(npm root -g)/openclaw/dist/index.js \
  --interpreter node \
  --name openclaw-gateway \
  -- gateway run --bind loopback --port 18789
pm2 save
```

> **หมายเหตุ**: ใช้ `node` รัน gateway โดยตรง — อย่าใช้ `openclaw gateway run` ผ่าน pm2 เพราะ CLI จะ exit หลัง spawn daemon ทำให้ pm2 restart วนไม่หยุด

หรือรันแบบ background ชั่วคราว (ไม่ auto-restart):

```bash
nohup openclaw gateway run --bind loopback --port 18789 > /tmp/openclaw-gateway.log 2>&1 &
```

ตรวจสอบ:

```bash
lsof -iTCP:18789 -sTCP:LISTEN
```

> **Auto-restart เมื่อ reboot บน macOS**: ใช้ pm2 (ดูวิธีที่ท้ายไฟล์) — ห้ามใช้ `openclaw gateway install` เพราะต้องการ systemd ซึ่งไม่มีบน macOS
>
> **หมายเหตุ**: ถ้ารัน gateway ผ่าน pm2 ให้ใช้ `pm2 restart openclaw-gateway` แทน `openclaw gateway restart` ทุกครั้ง

### 6.3 ตั้งค่า Hooks สำหรับ Webchat

```bash
nano ~/.openclaw/openclaw.json
```

เพิ่ม section `hooks` ที่ระดับ root (ข้างนอก `gateway` object):

```json
{
  "gateway": { ... },
  "hooks": {
    "enabled": true,
    "token": "วางค่า HOOKS_TOKEN ที่ generate จากขั้นตอน 5",
    "allowRequestSessionKey": true
  }
}
```

> **สำคัญ**: `hooks` ต้องอยู่ระดับเดียวกับ `gateway` — ห้ามวางไว้ข้างใน `gateway` จะ error

บันทึก: `Ctrl+X` → `Y` → `Enter`

Restart gateway:

```bash
# ถ้ารัน gateway ผ่าน pm2 (แนะนำ)
pm2 restart openclaw-gateway

# ถ้ารัน gateway แบบอื่น
openclaw gateway restart
```

---

## ขั้นตอนที่ 7 — ติดตั้ง openclaw-admin (Docker)

### 7.0 ข้ามขั้นตอน ufw

**บน macOS ข้ามขั้นตอนนี้ทั้งหมด** — Docker Desktop จัดการ network routing ให้อัตโนมัติ  
Container เข้าถึง host ผ่าน `host.docker.internal` โดยไม่ต้องแก้ firewall

### 7.1 Clone repo

```bash
git clone https://github.com/bosocmputer/openclaw-admin.git ~/openclaw-admin
cd ~/openclaw-admin
```

### 7.2 สร้างไฟล์ .env

```bash
nano ~/openclaw-admin/.env
```

วางข้อความนี้ แล้วแก้ค่า:

```env
SERVER_IP=192.168.1.100
API_TOKEN=ค่า API_TOKEN ที่ generate จากขั้นตอน 5
POSTGRES_PASSWORD=ตั้งรหัสผ่านที่นี่ (อย่างน้อย 16 ตัวอักษร)
SESSION_SECRET=วางค่าที่ได้จาก openssl ในขั้นตอน 5
```

ตัวอย่างที่กรอกครบ:

```env
SERVER_IP=192.168.1.100
API_TOKEN=9f4a2c8d1e7b3f6a0c5d8e2f5a9b3c7d1e4f7a0b
POSTGRES_PASSWORD=MyStr0ngP@ssw0rd2026!
SESSION_SECRET=a3f8c2d1e9b4f7a2c5d8e1f4b7c0d3e6f9a2b5c8d1e4f7a0b3c6d9e2f5a8b1
```

> `SERVER_IP` ใส่ IP ของ Mac ใน LAN (ดูจาก System Settings → Network)  
> **จดรหัสผ่านนี้ไว้** — ใช้ใน DATABASE_URL ของ openclaw-api ขั้นตอน 8.2  
> **อย่าใช้รหัสผ่านสั้น** เช่น `sml` หรือ `password` — PostgreSQL expose port 5432 ออก host

### 7.3 รัน Docker

```bash
cd ~/openclaw-admin
docker compose up -d --build
```

> ครั้งแรกใช้เวลา 3–5 นาที — Docker จะสร้าง PostgreSQL user `openclaw` และ tables อัตโนมัติ

ตรวจสอบ containers:

```bash
docker compose ps
```

ต้องเห็น 2 containers สถานะ `running`:

```text
openclaw-admin-openclaw-admin-1   running
openclaw-admin-postgres-1         running
```

ตรวจสอบ tables:

```bash
docker exec -it openclaw-admin-postgres-1 psql -U openclaw -d openclaw_admin -c "\dt"
```

ต้องเห็น 5 tables: `admin_users`, `audit_logs`, `webchat_messages`, `webchat_room_users`, `webchat_rooms`

ถ้าไม่เห็น tables:

```bash
docker compose down -v && docker compose up -d --build
```

---

## ขั้นตอนที่ 8 — ติดตั้ง openclaw-api

### 8.1 Clone repo

```bash
git clone https://github.com/bosocmputer/openclaw-api.git ~/openclaw-api
cd ~/openclaw-api
npm install
```

### 8.2 สร้างไฟล์ .env

```bash
nano ~/openclaw-api/.env
```

วางข้อความนี้ แก้ค่าให้ถูกต้อง:

```env
API_TOKEN=ค่า API_TOKEN เดียวกับใน ~/openclaw-admin/.env
PORT=4000
DATABASE_URL=postgresql://openclaw:POSTGRES_PASSWORD_HERE@localhost:5432/openclaw_admin
HOOKS_TOKEN=ค่า HOOKS_TOKEN จากขั้นตอน 5 (ค่าเดิม อย่า generate ใหม่)
```

> - `API_TOKEN` ต้องตรงกับ `API_TOKEN` ใน `~/openclaw-admin/.env`
> - `POSTGRES_PASSWORD_HERE` ต้องเป็นรหัสผ่านเดียวกับ `POSTGRES_PASSWORD` ใน `~/openclaw-admin/.env`
> - `HOOKS_TOKEN` ต้องตรงกับ `hooks.token` ใน `~/.openclaw/openclaw.json`
> - `DATABASE_URL` ใช้ `localhost` — PostgreSQL expose port 5432 ออกมาที่ host

### 8.3 รันด้วย pm2

```bash
cd ~/openclaw-api
pm2 start index.js --name openclaw-api
pm2 save
```

ตั้งค่า pm2 ให้ start อัตโนมัติเมื่อ reboot (macOS ใช้ launchd):

```bash
pm2 startup
```

คำสั่งนี้จะแสดง **คำสั่ง sudo** ที่ต้องรัน — **copy แล้วรันทันที** (แต่ละเครื่องจะต่างกัน)  
ตัวอย่างบน macOS:

```bash
sudo env PATH=$PATH:/Users/yourname/.npm-global/bin pm2 startup launchd -u yourname --hp /Users/yourname
```

> **สำคัญ**: ใช้คำสั่งที่ได้จาก `pm2 startup` จริงๆ — **อย่า copy จากตัวอย่างข้างบน**

ตรวจสอบ:

```bash
pm2 status
# ต้องเห็น openclaw-api: online
```

---

## ขั้นตอนที่ 9 — ทดสอบเข้าหน้าเว็บ

เปิด browser บนเครื่องเดียวกัน:

```text
http://localhost:3000
```

หรือจากเครื่องอื่นใน LAN:

```text
http://IP_ของ_Mac:3000
```

Login ด้วย:

```text
username: superadmin
password: superadmin
```

> **เปลี่ยนรหัสผ่านทันที** — ไปที่เมนู **สมาชิก** → เลือก superadmin → Reset Password

---

## ขั้นตอนที่ 10 — ตั้งค่าระบบผ่านหน้าเว็บ

### 10.1 ตั้ง Model (API Key)

1. เมนู **Model**
2. เลือก Provider (แนะนำ **OpenRouter**)
3. วาง API Key → กด **Test** → ต้องได้ ✓
4. เลือก Model → กด **Save**

### 10.2 เพิ่ม Agent

1. เมนู **Agents** → กด **เพิ่ม Agent**
2. กรอก Agent ID (เช่น `sale`, `stock`)
3. เลือก Access Mode ตามหน้าที่ (sale=ขาย, stock=คลัง, admin=ผู้บริหาร)
4. กด **Add**

### 10.3 ตั้งค่า MCP (เชื่อมต่อ ERP)

1. **Agents → เลือก Agent → MCP (คอลัมน์ขวาล่าง)**
2. กรอก URL ของ MCP Server
3. เลือก Access Mode ให้ตรงกับ Agent
4. กด **Ping** → ต้องได้ ✓
5. กด **Test Access** → ต้องเห็นรายการ tools
6. กด **Save MCP**

### 10.4 เพิ่ม Telegram Bot

1. เมนู **Telegram**
2. ถ้าเห็น banner **"Telegram ยังไม่ได้เปิดใช้งาน"** → กด **เปิดใช้งาน Telegram** ก่อน
3. กด **เพิ่ม Bot ใหม่**
4. กรอก Account ID (เช่น `sale`) และ Bot Token จาก @BotFather
5. กด **Add Bot**

### 10.5 ผูก Bot กับ Agent

1. เมนู **Telegram** → ที่ Bot card → Dropdown **Agent** → เลือก Agent

### 10.6 เพิ่ม Telegram User

1. **Agents → เลือก Agent → Users (คอลัมน์ขวาบน)**
2. กรอก Telegram User ID (ตัวเลข) และชื่อพนักงาน
3. กด **Enter** หรือปุ่ม **Add**
4. ระบบจะ restart gateway อัตโนมัติ

### 10.7 ตรวจสอบ Config

1. **Dashboard** → ดู **Config Health** — ต้องเป็น ✓ Valid
2. ถ้าไม่ Valid กด **Auto Fix**
3. กด **Restart Gateway**

> **Clean Stale Sessions**: ถ้า Webchat ตอบซ้ำใน LINE — กด **Clean Stale Sessions** บน Dashboard
> ระบบจะลบ `agent:*:main` sessions ที่มี `lastChannel=line` ค้างอยู่โดยอัตโนมัติ
> (หรือรอ cron ที่รันทุกวัน 3:00 AM)

### 10.8 ตั้งค่า Webchat (ถ้าต้องการให้พนักงานแชทผ่านเว็บ)

**สร้างห้องแชท:**

1. เมนู **Webchat** → กด **+ เพิ่มห้อง**
2. กรอก Agent (เช่น `sale`) และชื่อห้อง (เช่น `ฝ่ายขาย`)
3. เลือก Policy: **open** (ทุกคน) หรือ **allowlist** (เฉพาะที่กำหนด)
4. กด **Add**

**เพิ่มพนักงาน role=chat:**

1. เมนู **สมาชิก** → กด **เพิ่มสมาชิก**
2. กรอก username / password / ชื่อ
3. เลือก Role: **chat**
4. กด **Add**

> พนักงาน role=chat จะ login แล้วเห็นหน้า Webchat อย่างเดียว — ไม่มี sidebar เมนู admin
> Webchat ตอบใน webchat เท่านั้น ไม่ส่งไป LINE/Telegram

### 10.9 ตั้งค่า LINE OA — ใช้ cloudflared บน macOS

LINE ต้องการ **HTTPS webhook URL** — ต้องใช้ cloudflared expose port 18789 ออกเป็น HTTPS

**ติดตั้ง cloudflared ผ่าน Homebrew** (ไม่ใช่ linux binary):

```bash
brew install cloudflared
```

**รัน Quick Tunnel:**

```bash
nohup cloudflared tunnel --url http://localhost:18789 --no-autoupdate > /tmp/cloudflared.log 2>&1 &
```

ดู URL ที่ได้:

```bash
grep trycloudflare /tmp/cloudflared.log
```

URL จะอยู่ในรูป `https://xxxx-xxxx.trycloudflare.com`

> URL จาก trycloudflare.com เปลี่ยนทุกครั้งที่ restart cloudflared — ต้องอัปเดต Webhook URL ใน LINE Developers Console ทุกครั้ง

**เพิ่ม LINE OA ใน Web Admin:**

1. เมนู **LINE OA** → กด **เพิ่ม OA ใหม่**
2. กรอก Account ID (เช่น `sale`) — **ต้องไม่ซ้ำกับ username ของ webchat user** (ดูหมายเหตุด้านล่าง)
3. กรอก Webhook Path (เช่น `/line/webhook/sale`) — **แต่ละ OA ต้องต่างกัน**
4. กรอก Channel Access Token และ Channel Secret
5. กด **Add**

**ตั้ง Webhook URL ใน LINE Developers Console:**

```text
https://<tunnel-url>/line/webhook/<accountId>
```

ตัวอย่าง: `https://abc-def.trycloudflare.com/line/webhook/sale`

1. [LINE Developers Console](https://developers.line.biz/console/) → เลือก Channel
2. Messaging API → Webhook settings → ใส่ URL → **Verify** → ต้องได้ Success
3. เปิด **Use webhook**

> **สำคัญ — ป้องกัน webchat ตอบซ้ำใน LINE**:
> Session key ของ webchat มีรูปแบบ `hook:webchat:uid:{username}` — prefix `uid:` ป้องกัน
> ไม่ให้ gateway สับสนกับ LINE accountId
> อย่าตั้ง LINE accountId ที่มีคำว่า `uid:` นำหน้า และห้ามใช้ LINE accountId เดียวกับ
> username ของ webchat user — มิฉะนั้น gateway อาจ reply ไป LINE แทนที่จะตอบใน webchat
>
> **สำคัญ — Webhook Path ต้องไม่ซ้ำ**:
> ถ้า 2 OA ใช้ path เดียวกัน gateway จะ overwrite handler → OA แรกจะได้ 401 Unauthorized

### 10.10 ตั้งค่า Webhooks (ถ้าต้องการรับข้อมูลจากระบบภายนอก)

Webhooks plugin ให้ระบบภายนอก (เช่น ERP, LINE Notify) POST ข้อมูลเข้า agent โดยตรง

**เปิดใช้งาน Webhooks ใน openclaw.json:**

```bash
nano ~/.openclaw/openclaw.json
```

เพิ่ม section `plugins` ที่ระดับ root:

```json
{
  "plugins": {
    "entries": {
      "webhooks": {
        "enabled": true,
        "config": {
          "routes": {}
        }
      }
    }
  }
}
```

Restart gateway:

```bash
# ถ้ารัน gateway ผ่าน pm2 (แนะนำ)
pm2 restart openclaw-gateway

# ถ้ารัน gateway แบบอื่น
openclaw gateway restart
```

**เพิ่ม Webhook Route ผ่าน Web Admin:**

1. เมนู **Webhooks** → กด **เพิ่ม Route ใหม่**
2. กรอก Route Name (a-z0-9_- เท่านั้น เช่น `erp_notify`)
3. กรอก Path (เช่น `/webhooks/erp_notify`)
4. กรอก Session Key ที่ต้องการ inject เข้า (เช่น `agent:sale:main`)
5. กรอก Secret สำหรับ authenticate (ส่งผ่าน header `X-Webhook-Secret`)
6. กด **เพิ่ม**

> ระบบภายนอก POST ไปที่ `https://<gateway-url>/webhooks/<path>` พร้อม `X-Webhook-Secret: <secret>`

---

### 10.11 ตรวจสอบ Session Checkpoints

Session Checkpoints ถูกสร้างอัตโนมัติเมื่อ gateway ทำ compaction — ช่วย restore context ได้ถ้า compaction เสียหาย

**ดู Checkpoints:**

1. เมนู **Checkpoints**
2. เลือก Agent จาก selector
3. รายการ checkpoint แสดงขึ้นมา — กด **Restore** เพื่อ restore กลับ

> ก่อน restore ระบบจะ backup session ปัจจุบันโดยอัตโนมัติ — การสนทนาหลัง checkpoint จะหายไป

**ตั้งค่า Compaction (เพื่อสร้าง checkpoint):**

1. เมนู **Compaction** → ตั้งค่า mode และ threshold
2. gateway จะสร้าง `*.jsonl.reset.*` files อัตโนมัติเมื่อ compact

---

### 10.12 ตรวจสอบ Memory & Dreams

ดูสถานะ memory ของแต่ละ agent:

1. เมนู **Memory**
2. แต่ละ agent card แสดง 3 ส่วน:
   - **บันทึกรายวัน** — จำนวนไฟล์ `memory/*.md` ที่ AI สร้างจริง + preview + กด **ดูทั้งหมด** เพื่อเลือกอ่านแต่ละไฟล์
   - **MEMORY.md** — ความจำระยะยาว (main session เท่านั้น) + ปุ่ม **อ่าน**
   - **Dreams.md** — ผลสรุป dreaming phase + ปุ่ม **อ่าน**
   - Badge **dreaming on/off** — สถานะ `memory.dreaming.enabled`

> AI จะบันทึกชื่อและข้อมูล user ลง `memory/YYYY-MM-DD.md` ทันทีเมื่อ user แนะนำตัวในการสนทนา
>
> หน้านี้ auto-refresh ทุก 30 วินาที

---

## ขั้นตอนที่ 11 — ทดสอบระบบ

**ทดสอบ Telegram:**

1. เปิด Telegram → ค้นหา Bot → กด **Start**
2. ลองถามคำถามเกี่ยวกับสินค้าหรือลูกค้า

**ทดสอบ Webchat:**

1. Login ด้วย user role=chat
2. เลือกห้องแชท → พิมพ์ข้อความ
3. Bot ต้องตอบกลับใน Webchat เท่านั้น — ไม่ตอบใน LINE หรือ Telegram

---

## การอัปเดตระบบ

### อัปเดต openclaw-api

```bash
cd ~/openclaw-api
git pull origin main
npm install
pm2 restart openclaw-api
```

### อัปเดต openclaw-admin

```bash
cd ~/openclaw-admin
git pull origin main
docker compose up -d --build
```

---

## แก้ปัญหาเบื้องต้น (macOS เฉพาะ)

### pm2: command not found (หลังเปิด terminal ใหม่)

```bash
source ~/.zshrc
pm2 status
```

ถ้ายังไม่เจอ:

```bash
~/.npm-global/bin/pm2 status
```

### Docker container เชื่อม openclaw-api (port 4000) ไม่ได้

บน macOS ต้องใช้ `host.docker.internal` แทน `localhost` หรือ IP ใน config ที่รันใน container  
ถ้า openclaw-admin ยังเชื่อมไม่ได้ ให้ตรวจสอบว่า `SERVER_IP` ใน `.env` เป็น IP จริงของ Mac ใน LAN (ไม่ใช่ `localhost`)

### Docker Desktop ใช้ RAM เยอะเกินไป

เข้า Docker Desktop → Settings → Resources → Memory แล้วลดลงเหลือ 6 GB  
ระบบนี้ใช้จริงประมาณ 3–4 GB

### หน้าเว็บเข้าไม่ได้จากเครื่องอื่นใน LAN

ตรวจสอบ macOS Firewall:  
System Settings → Privacy & Security → Firewall → ตรวจสอบว่าไม่ได้บล็อก incoming connection บน port 3000

ถ้า Firewall เปิดอยู่ ให้เพิ่ม exception หรือปิด Firewall ชั่วคราวเพื่อทดสอบ

---

## แก้ปัญหาเบื้องต้น (ทั่วไป)

### หน้าเว็บเข้าไม่ได้

```bash
docker compose ps
docker logs openclaw-admin-openclaw-admin-1 --tail 20
```

### Gateway ไม่ออนไลน์ (Dashboard แสดง offline)

ถ้ารัน gateway ผ่าน pm2 (แนะนำ):

```bash
pm2 restart openclaw-gateway
pm2 logs openclaw-gateway --lines 30
```

ถ้ารัน gateway แบบอื่น:

```bash
openclaw gateway restart
openclaw gateway status
```

> **หมายเหตุ**: อย่าใช้ `kill` + `nohup` ถ้า gateway อยู่ใน pm2 เพราะ pm2 จะ restart ขึ้นมาใหม่อัตโนมัติอยู่แล้ว — การรัน `nohup` ซ้อนจะทำให้มี 2 process

### openclaw-api ไม่ตอบสนอง

```bash
pm2 status
pm2 restart openclaw-api
pm2 logs openclaw-api --lines 30
```

### Bot ไม่ตอบ

1. เมนู **Telegram** — ถ้าเห็น banner **"Telegram ยังไม่ได้เปิดใช้งาน"** → กด **เปิดใช้งาน Telegram**
2. **Dashboard → Config Health** — ถ้าไม่ Valid กด **Auto Fix**
3. เช็คว่า Bot ผูก Agent ไว้ใน **Telegram**
4. เช็คว่า User ID ถูก add ใน **Agents → Users**
5. กด **Restart Gateway** จาก Dashboard

### Webchat ไม่ตอบ (timeout / 502)

1. ตรวจสอบ `hooks` ใน `~/.openclaw/openclaw.json`:

```bash
grep -A5 '"hooks"' ~/.openclaw/openclaw.json
```

ต้องเห็น `"enabled": true`, `"token": "..."`, `"allowRequestSessionKey": true`

2. ตรวจสอบ `HOOKS_TOKEN` ใน `~/openclaw-api/.env` ต้องตรงกับ `hooks.token` ใน openclaw.json
3. Restart:

```bash
# ถ้ารัน gateway ผ่าน pm2 (แนะนำ)
pm2 restart openclaw-gateway

# ถ้ารัน gateway แบบอื่น
openclaw gateway restart

pm2 restart openclaw-api --update-env
```

> Webchat อาจใช้เวลา 30–60 วินาทีต่อคำถาม (agent ต้องดึงข้อมูล ERP) — นี่คือพฤติกรรมปกติ

### Webchat ตอบใน LINE ด้วย

มีสาเหตุได้ 2 แบบ — รันทั้งสอง script แล้ว restart gateway:

**แบบที่ 1 — sessions เก่าแบบ `hook:webchat:{username}` (ไม่มี `uid:`) ค้างอยู่:**

```bash
python3 << 'EOF'
import json, os, glob

for path in glob.glob(os.path.expanduser('~/.openclaw/agents/*/sessions/sessions.json')):
    with open(path) as f:
        data = json.load(f)
    bad = [k for k in data if 'hook:webchat:' in k and 'hook:webchat:uid:' not in k]
    if bad:
        print(f'{path}: removing {bad}')
        for k in bad: del data[k]
        with open(path, 'w') as f: json.dump(data, f, indent=2)
    else:
        print(f'{path}: clean')
EOF
```

**แบบที่ 2 — `main` session ของ agent มี `lastChannel=line` ค้างอยู่** (พบใน production):

เกิดเมื่อ agent เคยรับ LINE message มาก่อน แล้ว gateway ใช้ `main` session เป็น fallback ทำให้ webchat reply ออกไปทาง LINE

```bash
python3 << 'EOF'
import json, os, glob

for path in glob.glob(os.path.expanduser('~/.openclaw/agents/*/sessions/sessions.json')):
    with open(path) as f:
        data = json.load(f)
    changed = False
    for k, v in data.items():
        if k.endswith(':main') and isinstance(v, dict) and v.get('lastChannel') == 'line':
            print(f'{path}: clearing lastChannel from {k}')
            v.pop('lastChannel', None)
            v.pop('lastAccountId', None)
            v.pop('lastPeer', None)
            changed = True
    if changed:
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
    else:
        print(f'{path}: clean')
EOF
```

แล้ว restart gateway:

```bash
# ถ้ารัน gateway ผ่าน pm2 (แนะนำ)
pm2 restart openclaw-gateway

# ถ้ารัน gateway แบบอื่น
openclaw gateway restart
```

### Webchat สร้างห้องไม่ได้ (error: role "openclaw" does not exist)

PostgreSQL ยังไม่มี user `openclaw` — เกิดจาก `POSTGRES_PASSWORD` ใน `.env` ไม่ถูกต้อง หรือ volume ถูกสร้างก่อนตั้ง `.env`

```bash
cd ~/openclaw-admin
docker compose down -v
docker compose up -d --build
```

> ใช้ได้เฉพาะตอนติดตั้งใหม่เท่านั้น — ถ้ามีข้อมูลอยู่แล้วให้แจ้ง admin ก่อน

### ลืมรหัสผ่าน superadmin

```bash
docker exec -it openclaw-admin-postgres-1 psql -U openclaw -d openclaw_admin -c \
  "UPDATE admin_users SET password = '\$2b\$12\$MxRWHntDsOcVe0woYXsHrec7s15//9IhhHXgfTx1V7d0ueYmghN/m' WHERE username = 'superadmin';"
```

รหัสผ่านจะกลับเป็น `superadmin`

---

## ทางเลือก — รัน Gateway เป็น Persistent Service บน macOS (ผ่าน pm2)

> **บน macOS ต้องใช้ pm2 เท่านั้น** — `openclaw gateway install` ต้องการ systemd ซึ่งไม่มีบน macOS

```bash
pm2 start $(npm root -g)/openclaw/dist/index.js \
  --interpreter node \
  --name openclaw-gateway \
  -- gateway run --bind loopback --port 18789
pm2 save
pm2 startup
```

รัน sudo command ที่ pm2 แสดง เพื่อตั้ง launchd auto-start

> ถ้ารัน gateway ผ่าน pm2 ให้ใช้ `pm2 restart openclaw-gateway` แทน `openclaw gateway restart` ทุกครั้ง

---

## สรุปข้อมูลที่ต้องบันทึกหลังติดตั้ง

| รายการ | ค่า |
| ------ | --- |
| IP Address ของ Mac | |
| Admin URL | `http://IP:3000` |
| superadmin password | (ที่ตั้งใหม่) |
| POSTGRES_PASSWORD | |
| SESSION_SECRET | |
| API_TOKEN | (generate เองจากขั้นตอน 5 — ห้ามใช้ค่า default) |
| HOOKS_TOKEN | |
| Telegram Bot Token(s) | |
| OpenRouter API Key | |
| MCP Server URL | |
| LINE Tunnel URL | (เปลี่ยนทุก restart) |
