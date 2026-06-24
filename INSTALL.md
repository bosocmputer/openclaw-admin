# คู่มือติดตั้ง OpenClaw ERP Chatbot Admin System

> สำหรับทีมติดตั้งระบบที่ร้านใหม่ — ใช้เวลาประมาณ 30–60 นาที
>
> อัปเดตล่าสุด: ใช้ **OpenClaw ERP Runtime Artifact** เป็น runtime หลักของ gateway เพื่อให้ behavior เหมือน dev server ทุกเครื่อง

---

## ข้อมูลที่ต้องเตรียมก่อนเริ่ม

| ข้อมูล | ตัวอย่าง | หมายเหตุ |
|--------|---------|---------|
| IP address ของ server | `192.168.1.100` | ถามผู้ดูแลระบบร้าน |
| Telegram Bot Token | `123456:ABC-DEF...` | ขอจาก @BotFather |
| OpenRouter API Key | `sk-or-v1-...` | จาก openrouter.ai |
| Kilo AI API Key (ถ้าใช้) | `kg_...` หรือ key จาก Kilo | ต้องทดสอบ runtime จริงก่อน save model |
| MCP Server URL | `http://192.168.1.50:3001/sse` | ถามทีมที่ติดตั้ง MCP |
| OpenClaw ERP Runtime Artifact | `https://raw.githubusercontent.com/bosocmputer/openclaw-runtime-artifacts/3ede1322c6651657dee4546bcade6efb9e4f7fcd/releases/2026.6.8-erp-20260624-line-burst-coalescing/openclaw-runtime-2026.6.8-erp-latest.tar.gz` | ใช้แทน `npm install -g openclaw` สำหรับ gateway |
| รหัสผ่าน Admin | ตั้งเองได้ | สำหรับ login หน้าเว็บ |

---

## ภาพรวมระบบ

```
Browser (port 3000)
    │  HTTP — ผ่าน Next.js proxy → /api/proxy/*
    ▼
openclaw-admin (Docker, port 3000)   ← Next.js frontend + proxy
    │  Bearer token → http://SERVER_IP:4000
    ▼
openclaw-api (pm2, port 4000)        ← Express API บน host
    │  POST /hooks/agent → http://127.0.0.1:18789
    ▼
openclaw-gateway (port 18789)        ← ERP runtime artifact, LINE, Telegram
    │
    └── PostgreSQL (Docker, port 5432)   ← admin_users, webchat_*
```

> **หมายเหตุ**: openclaw-api รันบน host โดยตรง (ไม่ใช่ Docker) เพราะต้องอ่าน/เขียน config และคุยกับ gateway ได้ง่าย
>
> **สำคัญ**: gateway production ต้องรันจาก `/root/openclaw-runtime-2026.6.8-erp/dist/index.js` หรือ path runtime artifact ที่ติดตั้งไว้ ห้ามใช้ global `openclaw` เป็น runtime หลัก เพราะ official package อาจมี behavior ไม่ตรงกับ dev/custom ERP runtime

---

## ขั้นตอนที่ 1 — อัปเดต Ubuntu และติดตั้ง tools พื้นฐาน

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nano
```

---

## ขั้นตอนที่ 2 — ติดตั้ง Node.js 22+ (บน host)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

ตรวจสอบ:

```bash
node --version   # ต้องได้ v22.x.x ขึ้นไป
npm --version
```

---

## ขั้นตอนที่ 3 — ติดตั้ง Docker

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
```

> **สำคัญ**: ต้อง **logout แล้ว login ใหม่** เพื่อให้สิทธิ์ Docker มีผล

```bash
exit
```

SSH เข้ามาใหม่ แล้วทดสอบ:

```bash
docker --version
docker compose version   # ต้องได้ v2.x.x
```

---

## ขั้นตอนที่ 4 — ตั้งค่า npm global path และติดตั้ง global packages

npm ติดตั้ง global packages ไว้ที่ `~/.npm-global` ซึ่ง **ไม่อยู่ใน PATH เริ่มต้น** — ต้องตั้งก่อน:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

แล้วติดตั้ง:

```bash
npm install -g pm2 openclaw@2026.6.8
```

ตรวจสอบ:

```bash
pm2 --version
openclaw --version
```

> **สำคัญ**:
> - `openclaw` global ใช้เป็น CLI ช่วยสร้าง/ตรวจ config เท่านั้น
> - gateway production ในคู่มือนี้ **ไม่ได้รันจาก global openclaw** แต่รันจาก ERP runtime artifact ในขั้นตอนที่ 6
> - ถ้าเปิด terminal ใหม่แล้ว `pm2` หรือ `openclaw` ไม่เจอ ให้รัน `source ~/.bashrc` อีกครั้ง

---

## ขั้นตอนที่ 5 — Generate tokens

สร้าง token 3 ตัว (ใช้ต่างกันทั้งหมด — ห้ามใช้ค่าตัวอย่างจากคู่มือนี้):

```bash
# HOOKS_TOKEN — ใช้ใน openclaw.json และ openclaw-api/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SESSION_SECRET — ใช้ใน openclaw-admin/.env
openssl rand -hex 32

# API_TOKEN — ใช้ใน openclaw-api/.env และ openclaw-admin/.env (แทนค่า default)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**จดค่าทั้งสามไว้** — จะใช้ในขั้นตอน 6.3, 7.2 และ 8.2

> **สำคัญ**: อย่าใช้ค่า `sml-openclaw-2026` จากตัวอย่างในคู่มือนี้เป็น API_TOKEN จริง — generate ใหม่ทุกครั้ง

---

## ขั้นตอนที่ 6 — ติดตั้ง OpenClaw ERP Gateway Runtime

### 6.1 สร้าง config พื้นฐานด้วย openclaw CLI

```bash
openclaw onboard
```

wizard จะถามเรื่อง model/provider — **เลือกอะไรก็ได้ แล้วกด Enter ผ่านจนจบ** อย่ากด Ctrl+C กลางคัน

คำสั่งนี้สร้าง `~/.openclaw/openclaw.json` และ config พื้นฐาน

> ค่าที่เลือกใน wizard แก้ได้ทั้งหมดผ่าน Web Admin ในขั้นตอนถัดไป
> หลังจากนี้ CLI เป็นแค่ตัวช่วย config ไม่ใช่ runtime production

### 6.2 ดาวน์โหลด ERP runtime artifact

```bash
cd /root

curl -fL -o openclaw-runtime-2026.6.8-erp-latest.tar.gz \
  https://raw.githubusercontent.com/bosocmputer/openclaw-runtime-artifacts/3ede1322c6651657dee4546bcade6efb9e4f7fcd/releases/2026.6.8-erp-20260624-line-burst-coalescing/openclaw-runtime-2026.6.8-erp-latest.tar.gz

sha256sum openclaw-runtime-2026.6.8-erp-latest.tar.gz
```

ต้องได้ค่า:

```text
1f4ca1e96d6ea84b7e26da1091f323a50c39e023c18c1e36a100966d55e291e7  openclaw-runtime-2026.6.8-erp-latest.tar.gz
```

ถ้า checksum ไม่ตรง ให้ลบไฟล์แล้ว download ใหม่ ห้ามติดตั้งต่อ

### 6.3 แตกไฟล์ runtime และสร้าง start script

```bash
cd /root

BACKUP_ID=$(date +%Y%m%d%H%M%S)
mkdir -p /root/openclaw-backups/$BACKUP_ID

cp -a /root/openclaw-runtime-2026.6.8-erp /root/openclaw-backups/$BACKUP_ID/openclaw-runtime-2026.6.8-erp 2>/dev/null || true
cp -a /root/start-openclaw-gateway.sh /root/openclaw-backups/$BACKUP_ID/start-openclaw-gateway.sh 2>/dev/null || true

rm -rf /root/openclaw-runtime-2026.6.8-erp
tar -xzf /root/openclaw-runtime-2026.6.8-erp-latest.tar.gz -C /root --no-same-owner

cat > /root/start-openclaw-gateway.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
export HOME=/root
export PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
exec /usr/bin/node /root/openclaw-runtime-2026.6.8-erp/dist/index.js gateway --port 18789
SH

chmod +x /root/start-openclaw-gateway.sh

echo "BACKUP_ID=$BACKUP_ID"
```

### 6.4 Start gateway ผ่าน pm2

```bash
pm2 delete openclaw-gateway || true
fuser -k 18789/tcp || true
pm2 start /root/start-openclaw-gateway.sh --name openclaw-gateway --cwd /root
sleep 8

pm2 list
ss -ltnp | grep 18789 || true
pm2 save
```

ตรวจสอบว่ารัน runtime ถูกตัว:

```bash
ps -ef | grep -E "openclaw-runtime-2026.6.8-erp|openclaw.*gateway" | grep -v grep
```

ต้องเห็นประมาณนี้:

```text
node /root/openclaw-runtime-2026.6.8-erp/dist/index.js gateway --port 18789
```

> **สำคัญ**: ห้าม start gateway ด้วย `openclaw gateway run` ใน production เพราะจะกลับไปใช้ official runtime ที่อาจไม่เหมือน dev

### 6.5 ตั้งค่า Hooks สำหรับ Webchat

เปิดไฟล์ config:

```bash
nano /root/.openclaw/openclaw.json
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
pm2 restart openclaw-gateway
```

---

## ขั้นตอนที่ 7 — ติดตั้ง openclaw-admin (Docker)

### 7.0 ตั้งค่า ufw (firewall)

Docker container ต้องการเข้าถึง openclaw-api (port 4000) ที่รันบน host — ถ้า ufw เปิดอยู่จะถูกบล็อกโดยอัตโนมัติ

เช็คสถานะ:

```bash
ufw status
```

ถ้า `Status: active` — เพิ่ม rule อนุญาต Docker subnet:

```bash
ufw allow from 172.16.0.0/12 to any port 4000
ufw allow 3000
ufw reload
```

> **หมายเหตุ**: `172.16.0.0/12` ครอบคลุม Docker bridge network ทั้งหมด (`172.16.x.x`–`172.31.x.x`) ไม่ต้องรู้ subnet ของ Docker ล่วงหน้า

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
npm ci --omit=dev
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
OPENCLAW_BIN=/root/openclaw-runtime-2026.6.8-erp/dist/index.js
CONVERSATION_ANALYSIS_ENABLED=1
MEMORY_LEARNING_REVIEW_ENABLED=1
MONITOR_MEDIA_PREVIEW_ENABLED=1
```

> - `API_TOKEN` ต้องตรงกับ `API_TOKEN` ใน `~/openclaw-admin/.env`
> - `POSTGRES_PASSWORD_HERE` ต้องเป็นรหัสผ่านเดียวกับ `POSTGRES_PASSWORD` ใน `~/openclaw-admin/.env`
> - `HOOKS_TOKEN` ต้องตรงกับ `hooks.token` ใน `~/.openclaw/openclaw.json`
> - DATABASE_URL ใช้ `localhost` เสมอ — PostgreSQL expose port 5432 ออกมาที่ host
> - `OPENCLAW_BIN` สำคัญมาก — ทำให้หน้า Model ทดสอบด้วย ERP runtime artifact ตัวเดียวกับ gateway จริง ไม่ใช่ global `openclaw`
> - `CONVERSATION_ANALYSIS_ENABLED=1` เปิดหน้าประวัติบทสนทนาและ export
> - `MEMORY_LEARNING_REVIEW_ENABLED=1` เปิด Learning Review queue ในหน้า Memory
> - `MONITOR_MEDIA_PREVIEW_ENABLED=1` เปิด preview รูปใน Monitor/Conversation Analysis เมื่อ runtime มี media ref ที่ปลอดภัย

### 8.3 รันด้วย pm2

```bash
cd ~/openclaw-api
pm2 start index.js --name openclaw-api
pm2 save
```

ตั้งค่า pm2 ให้ start อัตโนมัติเมื่อ reboot:

```bash
pm2 startup
```

คำสั่งนี้จะแสดง **คำสั่ง sudo** ที่ต้องรัน — **copy แล้วรันทันที** (แต่ละเครื่องจะต่างกัน) ตัวอย่าง:

```bash
sudo env PATH=$PATH:/home/bosscatdog/.npm-global/bin:/usr/bin pm2 startup systemd -u bosscatdog --hp /home/bosscatdog
```

> **สำคัญ**: ใช้คำสั่งที่ได้จาก `pm2 startup` จริงๆ — **อย่า copy จากตัวอย่างข้างบน** เพราะ path และ username ต่างกันแต่ละเครื่อง

ตรวจสอบ:

```bash
pm2 status
# ต้องเห็น openclaw-api: online

systemctl status pm2-$USER
# ต้องเห็น active (running)
```

---

## ขั้นตอนที่ 9 — ทดสอบเข้าหน้าเว็บ

เปิด browser:

```text
http://SERVER_IP:3000
```

Login ด้วย:

```text
username: superadmin
password: superadmin
```

> **เปลี่ยนรหัสผ่านทันที** — ไปที่เมนู **สมาชิก** → เลือก superadmin → Reset Password
> รหัสผ่าน default `superadmin` เป็นที่รู้จักสาธารณะ — ถ้าไม่เปลี่ยนก่อนออก internet ระบบจะโดน brute force

---

## ขั้นตอนที่ 10 — ตั้งค่าระบบผ่านหน้าเว็บ

### 10.1 ตั้ง Model และทดสอบ Runtime จริง

1. เมนู **Model**
2. ส่วน **Provider Keys**:
   - ใส่ API key ของ provider ที่ใช้ เช่น OpenRouter หรือ Kilo AI
   - กด **ทดสอบ key** — ต้องผ่านก่อนเลือก model
3. ส่วน **Model ข้อความ**:
   - เลือก **Model หลัก** (บังคับ)
   - เลือก **Model สำรอง** ได้หลายตัว (ไม่บังคับ แต่แนะนำอย่างน้อย 1 ตัว)
   - พิมพ์ข้อความทดสอบ เช่น `สวัสดีครับ`
   - กด **ทดสอบ model นี้** กับ Model หลักและ Model สำรองที่เลือก
   - ต้องเห็นสถานะ **ทดสอบผ่าน** ก่อนบันทึก
4. ส่วน **Model รูปภาพ**:
   - ไม่บังคับ เปิดเฉพาะเมื่อลูกค้าจะส่งรูปสินค้าให้ chatbot
   - ถ้าเปิด ต้องอัปโหลดรูปทดสอบและกดทดสอบให้ผ่านก่อน
5. กด **บันทึกค่า Model**
6. กด **Restart Gateway**
7. ทดสอบ Telegram ใหม่ด้วย `/reset` และ `สวัสดี`

> **สำคัญสำหรับ Kilo AI**:
> - การเห็น model ใน catalog ยังไม่พอ ต้องผ่าน **runtime test** จริงก่อน
> - ถ้าไม่ผ่านและขึ้นว่า “Model นี้อยู่ใน catalog แต่ OpenClaw runtime ใช้งานจริงไม่ได้” ห้าม save model นั้น ให้เลือกตัวอื่นหรืออัปเดต `openclaw-api`/runtime ก่อน
> - ถ้าเคยใช้ Kilo ก่อนอัปเดต อาจมี catalog เก่าค้าง ต้องทำตามหัวข้อแก้ปัญหา “Kilo model เป็น Unknown model”

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

1. เมนู **System Check**
2. กด **Run Health Check**
3. ถ้าเห็น **ระบบพร้อมใช้งาน** และไม่มีรายการใน **สิ่งที่ต้องจัดการ** แปลว่าผ่าน
4. ถ้ามี warning ให้ใช้ปุ่มแก้ไขในรายการนั้น เช่น **ทดสอบ Model ที่ตั้งไว้**, **ยืนยัน Regression Telegram ผ่านแล้ว**, หรือ **Restart Gateway**
5. รายละเอียดทางเทคนิคอยู่ในส่วน **รายละเอียดการตรวจระบบ** และ **คำสั่งสำหรับทีมเทคนิค**

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

### 10.9 ตั้งค่า LINE OA (ถ้าใช้ LINE Messaging API)

LINE ต้องการ **HTTPS webhook URL** — ต้องใช้ cloudflared expose port 18789 ออกเป็น HTTPS

**ติดตั้ง cloudflared:**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
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
pm2 restart openclaw-gateway
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

### 10.12 ตรวจสอบ Memory Learning

หน้า **Memory** ใช้สำหรับทีม admin/operator เท่านั้น ไม่ใช่หน้าที่ลูกค้าหรือ chat user ใช้งาน

1. เมนู **Memory**
2. แท็บ **Overview** อธิบาย Learning Loop:
   - `MEMORY.md` = ความจำที่ runtime ใช้ตอบจริง
   - `memory/*.md` = บันทึกรายวัน/working notes สำหรับ review
   - `DREAMS.md` = review diary จาก dreaming phase ยังไม่ถือเป็น truth โดยตรง
3. แท็บ **Learning Review** ใช้ตรวจ candidate ที่สร้างจาก Conversation Analysis หรือ admin กรอกเอง
4. Candidate แต่ละรายการต้องถูก admin ตัดสินก่อน:
   - `MEMORY.md` = fact/preference เฉพาะ agent/ร้านที่ยืนยันแล้ว
   - `Business Profile` = pattern ธุรกิจทั่วไป
   - `SOUL` = กติกาการตอบ/safety/tool contract
   - `MCP/Search` = synonym, normalization หรือ search behavior
   - `Model/Runtime` = timeout, fallback, latency หรือ runtime behavior
5. Apply อัตโนมัติใน v1 ทำได้เฉพาะ target `MEMORY.md` และระบบจะสร้าง backup ก่อนทุกครั้ง
6. ถ้า apply memory จริง ให้ restart gateway หรือ reset active sessions เพื่อให้ bot โหลด context ใหม่

> ลูกค้าแชทตามปกติ ระบบเก็บ evidence จากบทสนทนาไว้ใน Conversation Analysis แล้ว admin ค่อยส่งเรื่องที่ควรเรียนรู้เข้า Learning Review
> ห้ามให้ chat user เขียน memory โดยตรง เพราะเสี่ยงจำข้อมูลผิดหรือ prompt injection

---

### 10.13 ใช้ Conversation Analysis เพื่อรอ feedback ลูกค้า

หลังติดตั้ง/อัปเดตและให้ลูกค้าทดลองใช้งาน ให้ใช้หน้านี้เพื่อเก็บข้อมูลจริงก่อนจูน agent:

1. เปิด **Conversation Analysis** (`/analysis/conversations`)
2. Filter ช่วงวันที่, agent, channel หรือ issue tag
3. ดู turn detail: คำถาม, คำตอบ, tool/model evidence, media preview และ raw timeline ที่ runtime บันทึกจริง
4. กด **Export for Codex** เพื่อส่งข้อมูลให้ทีมวิเคราะห์ SOUL/MCP/Search ต่อ
5. ถ้าเจอ turn ที่ควรนำไปเรียนรู้ ให้กด **ส่งเรื่องนี้ให้ Admin Review**
6. เปิด **Memory → Learning Review** หรือปุ่ม **เปิด Learning Review** เพื่อตรวจ candidate ต่อ

หลักการแยกชั้น:

- ปัญหาค้นสินค้าไม่เจอหรือคำพ้อง → `MCP/Search`
- กติกาตอบผิด เช่น เดาราคา/เดาสต็อก → `SOUL`
- บริบทธุรกิจทั่วไปซ้ำหลายเคส → `Business Profile`
- Model timeout/fallback/latency → `Model/Runtime`
- ความจำเฉพาะร้านที่ admin ยืนยันแล้ว → `MEMORY.md`

> Export ไม่รวมไฟล์รูปจริง ส่งเฉพาะ metadata/text preview แบบ redacted เท่านั้น

## ขั้นตอนที่ 11 — ทดสอบระบบ

**ทดสอบ Model Runtime ก่อนทดสอบแชท:**

1. เมนู **Model**
2. เลือก model ที่ใช้งานจริง
3. พิมพ์ข้อความทดสอบ เช่น `สวัสดีครับ`
4. กด **ทดสอบ model นี้**
5. ต้องได้คำตอบจาก AI และสถานะ **ทดสอบผ่าน**

ทดสอบผ่าน command line ได้ด้วย:

```bash
cd ~/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -X POST "http://127.0.0.1:4000/api/models/message-test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"primary":"kilocode/openai/gpt-4o-mini","fallbacks":[],"prompt":"สวัสดีครับ","capability":"text","refresh":true}' \
  | python3 -m json.tool
```

> ถ้าไม่ได้ใช้ Kilo ให้เปลี่ยน `primary` เป็น model provider ที่เลือก เช่น `openrouter/google/gemini-2.5-flash-lite`

**ทดสอบ Telegram:**

1. เปิด Telegram → ค้นหา Bot → กด **Start**
2. ส่ง `/reset`
3. ส่ง `สวัสดี`
4. ลองถามคำถามเกี่ยวกับสินค้าหรือลูกค้า

**ทดสอบ Webchat:**

1. Login ด้วย user role=chat
2. เลือกห้องแชท → พิมพ์ข้อความ
3. Bot ต้องตอบกลับใน Webchat เท่านั้น — ไม่ตอบใน LINE หรือ Telegram

### 11.1 Post-deploy Health Gate (ต้องทำทุกครั้งหลังติดตั้ง/อัปเดต)

หลังติดตั้งหรืออัปเดต runtime/API/Admin ให้ทำ health gate นี้ทุกครั้งก่อนส่งมอบงาน ลูกค้าควรเห็น Dashboard เป็น `Overall Health = OK` หรืออย่างน้อยไม่มี warning ที่ต้อง action จริง

#### วิธีแนะนำผ่านหน้าเว็บ

1. เปิด **System Check** (`/system`)
2. กด **Run Health Check**
3. ถ้าเห็น **ระบบพร้อมใช้งาน** และไม่มีรายการใน **สิ่งที่ต้องจัดการ** ถือว่าผ่าน
4. ถ้ามี `model runtime issue` ให้กด **ทดสอบ Model ที่ตั้งไว้** แล้วรอผลทีละ model
5. ถ้ามี `ทดสอบ Telegram หลังเปลี่ยน runtime` ให้ทดสอบ Telegram จริงก่อน แล้วกด **ยืนยัน Regression Telegram ผ่านแล้ว**
6. ถ้าเป็น `telemetry.telegram` แบบ info ให้ส่งข้อความทดสอบใน Telegram แล้วกด **Run Health Check** อีกครั้ง

> หน้า `/system` จะไม่ยิง provider/runtime test เองตอนเปิดหน้า เพื่อลด cost และป้องกัน admin เข้าใจผิด ต้องกด action เองเท่านั้น

#### 1) ยืนยันว่า Telegram regression ผ่านแล้ว

ทดสอบใน Telegram จริงก่อน:

```text
/reset
สวัสดี
ขอเช็คราคา โช๊ค jazz
ขอเช็คยอดคงเหลือ โช๊ค jazz
```

ถ้าตอบถูกต้อง ให้บันทึกผล regression ใน openclaw-api:

```bash
cd ~/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -X POST "http://127.0.0.1:4000/api/dashboard/telegram-regression/pass" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"post-deploy-telegram-regression-passed"}' \
  | python3 -m json.tool
```

> ถ้าไม่บันทึกขั้นตอนนี้ Dashboard อาจขึ้น `ทดสอบ Telegram หลังเปลี่ยน runtime` แม้ bot ใช้งานได้แล้ว

#### 2) ทดสอบ model ที่ config ใช้อยู่จริง

คำสั่งนี้จะอ่าน model ที่ยังไม่ผ่าน runtime verification แล้วทดสอบทีละตัว ผลทดสอบจะถูกเก็บไว้ใน `~/.openclaw/model-runtime-test-cache.json` เพื่อให้ Health ไม่กลับไปเป็น `runtime_unverified` หลัง restart API

```bash
cd ~/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4000/api/models/readiness?refresh=true" \
  -o /tmp/model-readiness.json

python3 - <<'PY' > /tmp/models-to-test.txt
import json
d=json.load(open('/tmp/model-readiness.json'))
seen=set()
for issue in d.get('runtimeVerificationIssues', []):
    ref=issue.get('ref')
    cap=issue.get('capability') or 'text'
    if ref and (ref,cap) not in seen:
        seen.add((ref,cap))
        print(ref, cap)
PY

cat /tmp/models-to-test.txt

while read MODEL CAPABILITY; do
  [ -n "$MODEL" ] || continue
  echo "== test $MODEL ($CAPABILITY) =="
  curl -sS -X POST "http://127.0.0.1:4000/api/models/runtime-test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"capability\":\"$CAPABILITY\",\"mode\":\"gateway\",\"refresh\":true}" \
    -o /tmp/model-runtime-test.json
  python3 - <<'PY'
import json
d=json.load(open('/tmp/model-runtime-test.json'))
print(d.get('model'), d.get('status'), d.get('durationMs'), d.get('safeMessage'))
PY
done < /tmp/models-to-test.txt
```

> ถ้า `/tmp/models-to-test.txt` ว่าง แปลว่าไม่มี model runtime issue เหลืออยู่

#### 3) ตรวจ System/Dashboard health ต้องไม่มี warning

```bash
cd ~/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4000/api/dashboard/overview?refresh=true" \
  -o /tmp/dashboard-overview.json

python3 - <<'PY'
import json
d=json.load(open('/tmp/dashboard-overview.json'))
print("health =", d.get("health",{}).get("status"))
print("warnings =", [(w.get("id"), w.get("summary")) for w in d.get("health",{}).get("warnings",[])])
PY
```

ผลที่ต้องการใน CLI:

```text
health = ok
warnings = []
```

ผลที่ต้องการใน UI:

- Dashboard: `Overall Health = OK`
- System Check: แสดง **ระบบพร้อมใช้งาน**
- รายการ **สิ่งที่ต้องจัดการ** ต้องว่าง

---

## การอัปเดตระบบ

> Production policy: gateway ต้องอัปเดตด้วย **OpenClaw ERP Runtime Artifact** เท่านั้น เพื่อให้ behavior เหมือน dev server ห้ามใช้ `npm install -g openclaw@latest` แล้วรันเป็น gateway runtime โดยตรง

### อัปเดต OpenClaw ERP Runtime

```bash
cd /root

curl -fL -o openclaw-runtime-2026.6.8-erp-latest.tar.gz \
  https://raw.githubusercontent.com/bosocmputer/openclaw-runtime-artifacts/3ede1322c6651657dee4546bcade6efb9e4f7fcd/releases/2026.6.8-erp-20260624-line-burst-coalescing/openclaw-runtime-2026.6.8-erp-latest.tar.gz

sha256sum openclaw-runtime-2026.6.8-erp-latest.tar.gz
```

ต้องได้:

```text
1f4ca1e96d6ea84b7e26da1091f323a50c39e023c18c1e36a100966d55e291e7  openclaw-runtime-2026.6.8-erp-latest.tar.gz
```

ถ้า checksum ตรง ให้ติดตั้ง:

```bash
cd /root

BACKUP_ID=$(date +%Y%m%d%H%M%S)
mkdir -p /root/openclaw-backups/$BACKUP_ID

cp -a /root/openclaw-runtime-2026.6.8-erp /root/openclaw-backups/$BACKUP_ID/openclaw-runtime-2026.6.8-erp 2>/dev/null || true
cp -a /root/start-openclaw-gateway.sh /root/openclaw-backups/$BACKUP_ID/start-openclaw-gateway.sh 2>/dev/null || true

rm -rf /root/openclaw-runtime-2026.6.8-erp
tar -xzf /root/openclaw-runtime-2026.6.8-erp-latest.tar.gz -C /root --no-same-owner

cat > /root/start-openclaw-gateway.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
export HOME=/root
export PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
exec /usr/bin/node /root/openclaw-runtime-2026.6.8-erp/dist/index.js gateway --port 18789
SH

chmod +x /root/start-openclaw-gateway.sh

pm2 delete openclaw-gateway || true
fuser -k 18789/tcp || true
pm2 start /root/start-openclaw-gateway.sh --name openclaw-gateway --cwd /root
sleep 8

pm2 list
ss -ltnp | grep 18789 || true
pm2 save

echo "BACKUP_ID=$BACKUP_ID"
```

ตรวจสอบว่ารัน runtime ถูกตัว:

```bash
ps -ef | grep -E "openclaw-runtime-2026.6.8-erp|openclaw.*gateway" | grep -v grep
```

ต้องเห็น:

```text
node /root/openclaw-runtime-2026.6.8-erp/dist/index.js gateway --port 18789
```

Rollback:

```bash
BACKUP_ID=<backup-id>
pm2 delete openclaw-gateway || true
rm -rf /root/openclaw-runtime-2026.6.8-erp
cp -a /root/openclaw-backups/$BACKUP_ID/openclaw-runtime-2026.6.8-erp /root/openclaw-runtime-2026.6.8-erp
cp -a /root/openclaw-backups/$BACKUP_ID/start-openclaw-gateway.sh /root/start-openclaw-gateway.sh
pm2 start /root/start-openclaw-gateway.sh --name openclaw-gateway --cwd /root
pm2 save
```

### อัปเดต openclaw-api

```bash
cd ~/openclaw-api
git pull --ff-only origin main
npm ci --omit=dev

grep -q '^CONVERSATION_ANALYSIS_ENABLED=' .env \
  && sed -i 's/^CONVERSATION_ANALYSIS_ENABLED=.*/CONVERSATION_ANALYSIS_ENABLED=1/' .env \
  || echo 'CONVERSATION_ANALYSIS_ENABLED=1' >> .env

grep -q '^MEMORY_LEARNING_REVIEW_ENABLED=' .env \
  && sed -i 's/^MEMORY_LEARNING_REVIEW_ENABLED=.*/MEMORY_LEARNING_REVIEW_ENABLED=1/' .env \
  || echo 'MEMORY_LEARNING_REVIEW_ENABLED=1' >> .env

grep -q '^MONITOR_MEDIA_PREVIEW_ENABLED=' .env \
  && sed -i 's/^MONITOR_MEDIA_PREVIEW_ENABLED=.*/MONITOR_MEDIA_PREVIEW_ENABLED=1/' .env \
  || echo 'MONITOR_MEDIA_PREVIEW_ENABLED=1' >> .env

pm2 restart openclaw-api --update-env
pm2 save
```

### อัปเดต openclaw-admin

```bash
cd ~/openclaw-admin
git pull --ff-only origin main
docker compose build openclaw-admin
docker compose up -d openclaw-admin
docker compose ps
```

### อัปเดตทั้งระบบ

ทำตามลำดับนี้:

1. อัปเดต OpenClaw ERP Runtime
2. อัปเดต openclaw-api
3. อัปเดต openclaw-admin
4. Smoke test Telegram:

```text
/reset
สวัสดี
ขอเช็คราคา โช๊ค jazz
ขอเช็คยอดคงเหลือ โช๊ค jazz
```

5. ทำหัวข้อ **11.1 Post-deploy Health Gate** เพื่อบันทึก regression, runtime-test model และยืนยันว่า Dashboard/System Check เป็น `health = ok`

---

## แก้ปัญหาเบื้องต้น

### หน้าเว็บเข้าไม่ได้

```bash
docker compose ps
docker logs openclaw-admin-openclaw-admin-1 --tail 20
```

### Gateway ไม่ออนไลน์ (Dashboard แสดง offline)

เช็คก่อนว่า process ใช้ runtime artifact:

```bash
ps -ef | grep -E "openclaw-runtime-2026.6.8-erp|openclaw.*gateway" | grep -v grep
```

ถ้าไม่เห็น `/root/openclaw-runtime-2026.6.8-erp/dist/index.js` ให้ติดตั้ง runtime artifact ใหม่ตามหัวข้อ "อัปเดต OpenClaw ERP Runtime"

ถ้าเห็นแล้ว ให้ restart และดู log:

```bash
pm2 restart openclaw-gateway
pm2 logs openclaw-gateway --lines 120
tail -n 160 /tmp/openclaw/openclaw-$(date +%F).log
```

> **หมายเหตุ**:
> - อย่าใช้ `openclaw gateway restart` ใน production flow นี้ เพราะอาจกลับไปใช้ official/global runtime
> - อย่าใช้ `kill` + `nohup` ถ้า gateway อยู่ใน pm2 เพราะอาจเกิด 2 process หรือชน port 18789

### openclaw-api ไม่ตอบสนอง

```bash
pm2 status
pm2 restart openclaw-api
pm2 logs openclaw-api --lines 30
```

### pm2: command not found (หลัง SSH เข้ามาใหม่)

pm2 อาจไม่อยู่ใน PATH ของ session ปัจจุบัน:

```bash
source ~/.bashrc
pm2 status
```

ถ้ายังไม่เจอ ให้ใช้ full path:

```bash
~/.npm-global/bin/pm2 status
~/.npm-global/bin/pm2 restart openclaw-api
```

### Bot ไม่ตอบ

1. เมนู **Telegram** — ถ้าเห็น banner **"Telegram ยังไม่ได้เปิดใช้งาน"** → กด **เปิดใช้งาน Telegram**
2. เมนู **System Check** → กด **Run Health Check**
3. ถ้ามีรายการใน **สิ่งที่ต้องจัดการ** ให้ใช้ปุ่มแก้ไขในหน้านั้นก่อน หรือกด **Copy Support Bundle** ส่งให้ dev
4. เช็คว่า Bot ผูก Agent ไว้ใน **Telegram**
5. เช็คว่า User ID ถูก add ใน **Agents → Users**
6. เช็คว่า gateway ใช้ runtime artifact:

```bash
ps -ef | grep -E "openclaw-runtime-2026.6.8-erp|openclaw.*gateway" | grep -v grep
```

7. เช็ค log:

```bash
tail -n 160 /tmp/openclaw/openclaw-$(date +%F).log
```

8. Restart gateway:

```bash
pm2 restart openclaw-gateway
```

ถ้า Telegram Web ขึ้น `This message is not supported on the web version of Telegram` แปลว่า gateway ไม่ได้ใช้ custom ERP runtime หรือ runtime artifact ไม่ตรงกับ dev ให้ติดตั้ง runtime artifact ใหม่ตามหัวข้อ "อัปเดต OpenClaw ERP Runtime"

### Kilo model เป็น Unknown model / Telegram ขึ้น Something went wrong

อาการ:

- หน้า Telegram ตอบ `⚠️ Something went wrong while processing your request`
- log มี `Unknown model: kilocode/...` หรือ `All models failed`
- บางครั้งหน้า Model ทดสอบ key/catalog ได้ แต่ gateway ยังใช้ model ไม่ได้

สาเหตุหลัก:

1. `openclaw-api` ไม่ได้ใช้ `OPENCLAW_BIN=/root/openclaw-runtime-2026.6.8-erp/dist/index.js`
2. gateway ยังไม่ได้ restart หลัง save model
3. Kilo catalog เก่าค้างและ schema ไม่ตรงกับ runtime
4. `openclaw-api` ยังไม่ใช่ version ล่าสุดที่ sanitize Kilo catalog

แก้ตามลำดับนี้:

```bash
cd ~/openclaw-api
grep -E '^OPENCLAW_BIN=' .env || echo 'OPENCLAW_BIN missing'
```

ถ้าไม่มี ให้เพิ่ม:

```bash
cat >> ~/openclaw-api/.env <<'EOF'
OPENCLAW_BIN=/root/openclaw-runtime-2026.6.8-erp/dist/index.js
EOF
```

อัปเดต API และ restart:

```bash
cd ~/openclaw-api
git pull --ff-only origin main
npm ci --omit=dev
pm2 restart openclaw-api --update-env
pm2 save
```

ทดสอบให้ API materialize Kilo catalog ใหม่:

```bash
cd ~/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -X POST "http://127.0.0.1:4000/api/models/message-test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"primary":"kilocode/openai/gpt-4o-mini","fallbacks":["kilocode/google/gemini-3.1-flash-lite"],"prompt":"สวัสดีครับ","capability":"text","refresh":true}' \
  | python3 -m json.tool
```

ถ้ายังเห็น `Invalid models.json schema` ใน gateway log ให้ซ่อม catalog เก่าที่ค้าง:

```bash
BACKUP_ID=$(date +%Y%m%d%H%M%S)
mkdir -p /root/openclaw-backups/$BACKUP_ID
cp -a /root/.openclaw /root/openclaw-backups/$BACKUP_ID/openclaw-state

python3 - <<'PY'
import json, glob, os, shutil, time

allowed = {'text', 'image'}
ts = str(int(time.time()))
paths = ['/root/.openclaw/openclaw.json']
paths += glob.glob('/root/.openclaw/agents/*/agent/plugins/kilocode/catalog.json')

def normalize(values):
    if not isinstance(values, list):
        values = ['text']
    out = []
    for v in values:
        s = str(v or '').strip().lower()
        if s in ('vision', 'images'):
            s = 'image'
        if s in ('messages', 'prompt'):
            s = 'text'
        if s in allowed and s not in out:
            out.append(s)
    return out or ['text']

for p in paths:
    if not os.path.exists(p):
        continue
    with open(p) as f:
        d = json.load(f)

    providers = []
    if isinstance(d.get('models', {}).get('providers', {}).get('kilocode'), dict):
        providers.append(d['models']['providers']['kilocode'])
    if isinstance(d.get('providers', {}).get('kilocode'), dict):
        providers.append(d['providers']['kilocode'])

    changed = 0
    for provider in providers:
        models = provider.get('models')
        if not isinstance(models, list):
            continue
        for m in models:
            if not isinstance(m, dict):
                continue
            next_input = normalize(m.get('input'))
            if m.get('input') != next_input:
                m['input'] = next_input
                changed += 1

    if changed:
        shutil.copy2(p, f'{p}.bak-input-{ts}')
        with open(p, 'w') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print('repaired', p, changed)
PY
```

Restart gateway และ reset session:

```bash
pm2 restart openclaw-gateway --update-env
pm2 save

cd ~/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)
curl -sS -X POST "http://127.0.0.1:4000/api/agents/stock/sessions/reset-active" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"post-kilo-catalog-repair"}'
```

### Webchat ไม่ตอบ (timeout / 502)

1. ตรวจสอบ `hooks` ใน `~/.openclaw/openclaw.json`:

```bash
grep -A5 '"hooks"' ~/.openclaw/openclaw.json
```

ต้องเห็น `"enabled": true`, `"token": "..."`, `"allowRequestSessionKey": true`

2. ตรวจสอบ `HOOKS_TOKEN` ใน `~/openclaw-api/.env` ต้องตรงกับ `hooks.token` ใน openclaw.json
3. Restart:

```bash
pm2 restart openclaw-gateway
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
pm2 restart openclaw-gateway
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

## Persistent Service Policy

### ผ่าน pm2 (แนะนำ)

```bash
pm2 start /root/start-openclaw-gateway.sh --name openclaw-gateway --cwd /root
pm2 save
pm2 startup
```

> ถ้ารัน gateway ผ่าน pm2 ให้ใช้ `pm2 restart openclaw-gateway` ทุกครั้ง

### ผ่าน systemd user service (runtime artifact)

สร้างไฟล์ `~/.config/systemd/user/openclaw-gateway.service`:

```ini
[Unit]
Description=OpenClaw Gateway ERP Runtime
After=network.target

[Service]
Type=simple
WorkingDirectory=/root
Environment=HOME=/root
Environment=PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/usr/bin/node /root/openclaw-runtime-2026.6.8-erp/dist/index.js gateway --port 18789
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

เปิดใช้งาน:

```bash
systemctl --user daemon-reload
systemctl --user enable openclaw-gateway.service
systemctl --user restart openclaw-gateway.service
systemctl --user status openclaw-gateway.service --no-pager
```

> อย่าใช้ `openclaw gateway install` ใน production flow นี้ เพราะจะสร้าง service ที่ชี้ไป official/global runtime แทน custom ERP runtime

---

## สรุปข้อมูลที่ต้องบันทึกหลังติดตั้ง

| รายการ | ค่า |
| ------ | --- |
| IP Address | |
| Admin URL | `http://IP:3000` |
| superadmin password | (ที่ตั้งใหม่) |
| POSTGRES_PASSWORD | |
| SESSION_SECRET | |
| API_TOKEN | (generate เองจากขั้นตอน 5 — ห้ามใช้ค่า default) |
| HOOKS_TOKEN | |
| Telegram Bot Token(s) | |
| OpenRouter API Key | |
| MCP Server URL | |
| Runtime Artifact URL | `https://raw.githubusercontent.com/bosocmputer/openclaw-runtime-artifacts/3ede1322c6651657dee4546bcade6efb9e4f7fcd/releases/2026.6.8-erp-20260624-line-burst-coalescing/openclaw-runtime-2026.6.8-erp-latest.tar.gz` |
| Runtime SHA256 | `1f4ca1e96d6ea84b7e26da1091f323a50c39e023c18c1e36a100966d55e291e7` |
| LINE Tunnel URL | (เปลี่ยนทุก restart) |

---

## ตรวจสอบสถานะหลังติดตั้งหรือ update

```bash
# Docker container
docker ps | grep openclaw

# pm2
pm2 list

# Runtime ที่ gateway ใช้จริง
ps -ef | grep -E "openclaw-runtime-2026.6.8-erp|openclaw.*gateway" | grep -v grep

# Gateway log
tail -n 120 /tmp/openclaw/openclaw-$(date +%F).log
```
