# คู่มือติดตั้ง OpenClaw Admin System

> สำหรับทีมติดตั้งระบบที่ร้านใหม่ — ใช้เวลาประมาณ 30–60 นาที

---

## ข้อมูลที่ต้องเตรียมก่อนเริ่ม

เตรียมข้อมูลเหล่านี้ให้ครบก่อนเริ่มติดตั้ง:

| ข้อมูล | ตัวอย่าง | หมายเหตุ |
|--------|---------|---------|
| IP address ของ server | `192.168.1.100` | ถามผู้ดูแลระบบร้าน |
| Telegram Bot Token | `123456:ABC-DEF...` | ขอจาก @BotFather |
| OpenRouter API Key | `sk-or-v1-...` | จาก openrouter.ai |
| MCP Server URL | `http://192.168.1.50:3001/sse` | ถามทีมที่ติดตั้ง MCP |
| รหัสผ่าน Admin | ตั้งเองได้ | สำหรับ login หน้าเว็บ |

---

## ภาพรวมระบบ

```
หน้าเว็บ Admin (port 3000)
       │
       ├── PostgreSQL (port 5432)   ← เก็บข้อมูล admin users
       │
openclaw-api (port 4000)            ← Express API
       │
openclaw-gateway (port 18789)       ← รับ-ส่งข้อความ Telegram
```

---

## ขั้นตอนที่ 1 — อัปเดต Ubuntu และติดตั้ง tools พื้นฐาน

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nano
```

---

## ขั้นตอนที่ 2 — ติดตั้ง Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

ตรวจสอบว่าติดตั้งสำเร็จ:

```bash
node --version   # ต้องได้ v22.x.x
npm --version    # ต้องได้ 10.x.x ขึ้นไป
```

---

## ขั้นตอนที่ 3 — ติดตั้ง Docker

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
```

> **สำคัญ**: หลังรันคำสั่งนี้ต้อง **logout แล้ว login ใหม่** เพื่อให้สิทธิ์ Docker มีผล

```bash
# logout
exit
```

SSH เข้ามาใหม่ แล้วทดสอบ:

```bash
docker --version         # ต้องได้ Docker version 24+
docker compose version   # ต้องได้ v2.x.x
```

---

## ขั้นตอนที่ 4 — ติดตั้ง OpenClaw CLI

```bash
npm install -g openclaw@latest
```

ตรวจสอบ:

```bash
openclaw --version
```

---

## ขั้นตอนที่ 5 — ติดตั้ง mcporter CLI

```bash
npm install -g mcporter
```

ตรวจสอบ:

```bash
mcporter --version
```

---

## ขั้นตอนที่ 6 — ติดตั้ง pm2

```bash
npm install -g pm2
```

---

## ขั้นตอนที่ 7 — ติดตั้ง openclaw-gateway

```bash
openclaw onboard --install-daemon --skip-setup
```

คำสั่งนี้จะ:
- สร้างไฟล์ config ที่ `~/.openclaw/openclaw.json`
- ติดตั้ง `openclaw-gateway` เป็น systemd service
- เริ่มรัน gateway อัตโนมัติ

> **หมายเหตุ**: ถ้า wizard ถามเรื่อง model/provider ให้กด `Ctrl+C` แล้วรันใหม่ด้วย `--skip-setup`
> ถ้า flag นี้ไม่ได้ผล ให้เลือกอะไรก็ได้ไปก่อน — ค่าทุกอย่างแก้ได้ภายหลังผ่าน Web Admin

ตรวจสอบสถานะ:

```bash
openclaw gateway status
```

> ถ้าเห็น `online` หรือ `running` แสดงว่าสำเร็จ

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

วางข้อความนี้ลงไป **แล้วแก้ค่าให้ถูกต้อง**:

```env
API_TOKEN=sml-openclaw-2026
PORT=4000
DATABASE_URL=postgresql://openclaw:POSTGRES_PASSWORD_HERE@localhost:5432/openclaw_admin
HOOKS_TOKEN=ใส่ค่าสุ่มที่นี่
```

> `POSTGRES_PASSWORD_HERE` ให้ใส่รหัสผ่านที่จะตั้งในขั้นตอนที่ 9 (ต้องตรงกัน)

**วิธีสร้าง HOOKS_TOKEN** (รันคำสั่งนี้แล้ว copy ผลลัพธ์มาวาง):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

บันทึกไฟล์: กด `Ctrl+X` → `Y` → `Enter`

### 8.3 รันด้วย pm2

```bash
pm2 start index.js --name openclaw-api
pm2 save
pm2 startup
```

คำสั่ง `pm2 startup` จะแสดงคำสั่งให้รันต่อ เช่น:

```
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u bosscatdog --hp /home/bosscatdog
```

**ให้ copy คำสั่งนั้นแล้วรันเลย** (แต่ละเครื่องจะต่างกัน)

ตรวจสอบ:

```bash
pm2 status
```

> ต้องเห็น `openclaw-api` สถานะ `online`

---

## ขั้นตอนที่ 9 — ติดตั้ง openclaw-admin + PostgreSQL

### 9.1 Clone repo

```bash
git clone https://github.com/bosocmputer/openclaw-admin.git ~/openclaw-admin
cd ~/openclaw-admin
```

### 9.2 สร้างไฟล์ .env

```bash
nano ~/openclaw-admin/.env
```

วางข้อความนี้ลงไป **แล้วแก้ค่าให้ถูกต้อง**:

```env
SERVER_IP=192.168.1.100
API_TOKEN=sml-openclaw-2026
POSTGRES_PASSWORD=ตั้งรหัสผ่านที่นี่
SESSION_SECRET=สร้างค่าสุ่มที่นี่
```

**วิธีสร้าง SESSION_SECRET** (รันคำสั่งนี้แล้ว copy ผลลัพธ์มาวาง):

```bash
openssl rand -hex 32
```

ตัวอย่าง `.env` ที่กรอกครบแล้ว:

```env
SERVER_IP=192.168.1.100
API_TOKEN=sml-openclaw-2026
POSTGRES_PASSWORD=MyStr0ngP@ss
SESSION_SECRET=a3f8c2d1e9b4f7a2c5d8e1f4b7c0d3e6f9a2b5c8d1e4f7a0b3c6d9e2f5a8b1
```

บันทึกไฟล์: กด `Ctrl+X` → `Y` → `Enter`

### 9.3 รัน Docker

```bash
cd ~/openclaw-admin
docker compose up -d --build
```

> ครั้งแรกจะใช้เวลา 3–5 นาที เพราะต้อง download image และ build

ตรวจสอบ:

```bash
docker compose ps
```

ต้องเห็น 2 containers สถานะ `running`:

```
NAME                              STATUS
openclaw-admin-openclaw-admin-1   running
openclaw-admin-postgres-1         running
```

---

## ขั้นตอนที่ 10 — ทดสอบเข้าหน้าเว็บ

เปิด browser แล้วเข้า:

```
http://SERVER_IP:3000
```

จะเห็นหน้า Login — เข้าด้วย:

```
username: superadmin
password: superadmin
```

> **สำคัญ**: เปลี่ยนรหัสผ่าน superadmin หลังเข้าระบบครั้งแรกทันที ไปที่เมนู **สมาชิก** → Reset Password

---

## ขั้นตอนที่ 11 — ตั้งค่าระบบผ่านหน้าเว็บ

เมื่อ login เข้ามาแล้ว ทำตามลำดับนี้:

### 11.1 ตั้ง Model (API Key)

1. ไปที่เมนู **Model**
2. เลือก Provider (แนะนำ **OpenRouter**)
3. วาง API Key ที่เตรียมไว้
4. กด **Test** → ต้องได้ ✓ OK
5. เลือก Model ที่ต้องการ
6. กด **Save**

### 11.2 เพิ่ม Telegram Bot

1. ไปที่เมนู **Telegram**
2. กด **เพิ่ม Bot ใหม่**
3. กรอก Account ID (ชื่อสั้นๆ เช่น `sale`, `stock`)
4. วาง Bot Token จาก @BotFather
5. กด **Add Bot**

### 11.3 เพิ่ม Agent

1. ไปที่เมนู **Agents**
2. กด **เพิ่ม Agent**
3. กรอก Agent ID (เช่น `sale`, `stock`)
4. เลือก Access Mode ตามหน้าที่ (sale=ขาย, stock=คลัง, admin=ผู้บริหาร)
5. กด **Add**

### 11.4 ตั้งค่า MCP (เชื่อมต่อ ERP)

1. ไปที่ **Agents → เลือก Agent → คอลัมน์ขวาล่าง MCP**
2. กรอก URL ของ MCP Server ที่เตรียมไว้
3. เลือก Access Mode ให้ตรงกับ Agent
4. กด **Ping** → ต้องได้ ✓ OK
5. กด **Test Access** → ต้องเห็นรายการ tools
6. กด **Save MCP**

### 11.5 เพิ่ม Telegram User

1. ไปที่ **Agents → เลือก Agent → คอลัมน์ขวาบน Users**
2. กรอก Telegram User ID (ตัวเลข) และชื่อพนักงาน
3. กด **Enter** หรือปุ่ม **Add**
4. ระบบจะ restart gateway อัตโนมัติ

### 11.6 ผูก Bot กับ Agent

1. ไปที่เมนู **Telegram**
2. ที่ Bot card → Dropdown **Agent** → เลือก Agent ที่ต้องการ

### 11.7 ตรวจสอบ Config

1. กลับไปที่ **Dashboard**
2. ดู **Config Health** — ต้องเป็น ✓ Valid
3. ถ้าไม่ Valid กด **Auto Fix**
4. กด **Restart Gateway**

### 11.8 ตั้งค่า Webchat (ถ้าต้องการให้พนักงานแชทผ่านเว็บ)

**เปิด Hooks ใน openclaw.json:**

```bash
nano ~/.openclaw/openclaw.json
```

เพิ่ม section `hooks` ลงใน JSON (ก่อน closing `}`):

```json
"hooks": {
  "enabled": true,
  "token": "ค่าเดียวกับ HOOKS_TOKEN ใน ~/openclaw-api/.env",
  "allowRequestSessionKey": true
}
```

บันทึกแล้ว restart gateway:

```bash
openclaw gateway restart
```

**เพิ่มห้องแชทใน Admin:**

1. ไปที่เมนู **Webchat**
2. กด **+ เพิ่มห้อง**
3. กรอก Agent (เช่น `sale`) และชื่อห้อง (เช่น `ฝ่ายขาย`)
4. เลือก Policy: **open** (ทุกคน) หรือ **allowlist** (เฉพาะที่กำหนด)
5. กด **Add**

**เพิ่มพนักงานที่ใช้ Webchat:**

1. ไปที่เมนู **สมาชิก**
2. กด **เพิ่มสมาชิก**
3. กรอก username / password / ชื่อ
4. เลือก Role: **chat**
5. กด **Add**

> พนักงาน role=chat จะ login แล้วเข้าหน้า Webchat ได้เลย — **ไม่มี sidebar เมนู** เห็นแค่รายการห้องแชทที่มีสิทธิ์ทางซ้าย และ chat area ทางขวา

---

## ขั้นตอนที่ 12 — ทดสอบ Bot

1. เปิด Telegram
2. ค้นหา Bot ที่ตั้งไว้
3. กด **Start** หรือพิมพ์ `/start`
4. ลองถามคำถามเกี่ยวกับสินค้าหรือลูกค้า

---

## การอัปเดตระบบ (ในอนาคต)

### อัปเดต openclaw-api

```bash
cd ~/openclaw-api
git pull
npm install
pm2 restart openclaw-api
```

### อัปเดต openclaw-admin

```bash
cd ~/openclaw-admin
git pull
docker compose up -d --build
```

---

## แก้ปัญหาเบื้องต้น

### หน้าเว็บเข้าไม่ได้

```bash
# ตรวจสอบ container ทำงานไหม
docker compose ps

# ดู log
docker logs openclaw-admin-openclaw-admin-1 --tail 20
```

### Gateway ไม่ออนไลน์ (Dashboard แสดง offline)

```bash
# restart gateway
openclaw gateway restart

# ดูสถานะ
openclaw gateway status
```

### openclaw-api ไม่ตอบสนอง

```bash
# ตรวจสอบสถานะ
pm2 status

# restart
pm2 restart openclaw-api

# ดู log
pm2 logs openclaw-api --lines 30
```

### Bot ไม่ตอบ

1. เช็ค **Dashboard → Config Health** — ถ้าไม่ Valid กด Auto Fix
2. เช็คว่า Bot ผูก Agent ไว้แล้วใน **Telegram**
3. เช็คว่า User ID ถูก add ไว้ใน **Agents → Users** แล้ว
4. ลอง **Restart Gateway** จาก Dashboard

### Webchat ไม่ตอบ (timeout / 502)

1. ตรวจสอบ `hooks` ใน `~/.openclaw/openclaw.json` — ต้องมี `enabled:true`, `token`, และ `allowRequestSessionKey:true`
2. ตรวจสอบ `HOOKS_TOKEN` ใน `~/openclaw-api/.env` ต้องตรงกับ `hooks.token` ใน openclaw.json
3. Restart gateway: `openclaw gateway restart`
4. Restart api: `pm2 restart openclaw-api --update-env`

---

### ลืมรหัสผ่าน superadmin

```bash
# เข้าไปใน postgres container
docker exec -it openclaw-admin-postgres-1 psql -U openclaw -d openclaw_admin

# reset รหัสผ่านเป็น "superadmin" (bcrypt hash)
UPDATE admin_users
SET password = '$2b$12$MxRWHntDsOcVe0woYXsHrec7s15//9IhhHXgfTx1V7d0ueYmghN/m'
WHERE username = 'superadmin';

-- กด Ctrl+D เพื่อออก
```

---

## สรุปข้อมูล Server ที่ต้องบันทึกไว้

หลังติดตั้งเสร็จ บันทึกข้อมูลเหล่านี้เก็บไว้:

| รายการ | ค่า |
|--------|-----|
| IP Address | |
| Admin URL | `http://IP:3000` |
| superadmin password | (ที่ตั้งใหม่) |
| POSTGRES_PASSWORD | (ที่ตั้งใน .env) |
| SESSION_SECRET | (ที่ generate ไว้) |
| Telegram Bot Token(s) | |
| OpenRouter API Key | |
| MCP Server URL | |
