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
openclaw onboard --install-daemon
```

คำสั่งนี้จะแสดง wizard ถามเรื่อง model/provider — **เลือกอะไรก็ได้ แล้วกด Enter ผ่านไปจนจบ** อย่ากด Ctrl+C กลางคัน

คำสั่งนี้จะ:
- สร้างไฟล์ config ที่ `~/.openclaw/openclaw.json`
- ติดตั้ง `openclaw-gateway` เป็น systemd service

> **สำคัญ**: ค่าที่เลือกใน wizard ไม่มีผลถาวร — แก้ได้ทั้งหมดผ่าน Web Admin ในขั้นตอนถัดไป
> ห้ามกด Ctrl+C กลางคัน เพราะจะทำให้ `openclaw.json` ไม่ถูกสร้าง

### 7.1 ตรวจสอบ gateway

```bash
openclaw gateway status
```

ถ้าเห็น `RPC probe: ok` แสดงว่า gateway รันอยู่แล้ว ข้ามไปขั้นตอน 7.2 ได้เลย

ถ้า gateway ไม่รัน (หรือรัน root user ที่ใช้ systemd --user ไม่ได้) ให้รันผ่าน pm2 แทน:

```bash
pm2 start /usr/lib/node_modules/openclaw/dist/index.js \
  --name openclaw-gateway \
  --interpreter node \
  -- gateway --port 18789
pm2 save
pm2 startup
# copy คำสั่งที่ได้แล้วรัน
```

> **หมายเหตุ**: ถ้ารัน gateway ผ่าน pm2 ให้ใช้ `pm2 restart openclaw-gateway` แทน `openclaw gateway restart` ทุกครั้ง

### 7.2 ตั้งค่า Hooks สำหรับ Webchat

เปิดไฟล์ config:

```bash
nano ~/.openclaw/openclaw.json
```

เพิ่ม section `hooks` ที่ระดับ root (ข้างนอก `gateway` object):

```json
{
  "gateway": { ... },
  "hooks": {
    "enabled": true,
    "token": "ค่าเดียวกับ HOOKS_TOKEN ที่จะตั้งในขั้นตอนที่ 9",
    "allowRequestSessionKey": true
  }
}
```

> **สำคัญ**: `hooks` ต้องอยู่ระดับเดียวกับ `gateway` — ห้ามวางไว้ข้างใน `gateway` จะ error
> ค่า `token` ต้องตรงกับ `HOOKS_TOKEN` ใน `~/openclaw-api/.env` เสมอ

บันทึกไฟล์: กด `Ctrl+X` → `Y` → `Enter`

---

## ขั้นตอนที่ 8 — ติดตั้ง openclaw-admin + PostgreSQL

> ทำขั้นตอนนี้ก่อน เพราะต้องได้ `POSTGRES_PASSWORD` ไปใช้ในขั้นตอนที่ 9

### 8.1 Clone repo

```bash
git clone https://github.com/bosocmputer/openclaw-admin.git ~/openclaw-admin
cd ~/openclaw-admin
```

### 8.2 ตั้งค่า .env

**ขั้นตอนที่ 1** — สร้าง SESSION_SECRET ก่อน:

```bash
openssl rand -hex 32
```

copy ค่าที่ได้ไว้ก่อน

**ขั้นตอนที่ 2** — สร้างไฟล์ .env:

```bash
nano ~/openclaw-admin/.env
```

วางข้อความนี้ แล้วแก้ค่า `SERVER_IP`, `POSTGRES_PASSWORD`, `SESSION_SECRET`:

```env
SERVER_IP=192.168.1.100
API_TOKEN=sml-openclaw-2026
POSTGRES_PASSWORD=ตั้งรหัสผ่านที่นี่
SESSION_SECRET=วางค่าที่ได้จาก openssl ด้านบน
```

ตัวอย่างที่กรอกครบ:

```env
SERVER_IP=192.168.1.100
API_TOKEN=sml-openclaw-2026
POSTGRES_PASSWORD=MyStr0ngP@ss
SESSION_SECRET=a3f8c2d1e9b4f7a2c5d8e1f4b7c0d3e6f9a2b5c8d1e4f7a0b3c6d9e2f5a8b1
```

บันทึก: กด `Ctrl+X` → `Y` → `Enter`

> **จดรหัสผ่านนี้ไว้** — จะต้องใช้อีกในขั้นตอนที่ 9

### 8.3 รัน Docker

```bash
cd ~/openclaw-admin
docker compose up -d --build
```

> ครั้งแรกใช้เวลา 3–5 นาที — Docker จะสร้าง PostgreSQL user `openclaw` และ tables อัตโนมัติ

ตรวจสอบ:

```bash
docker compose ps
```

ต้องเห็น 2 containers สถานะ `running`:

```text
NAME                              STATUS
openclaw-admin-openclaw-admin-1   running
openclaw-admin-postgres-1         running
```

**ตรวจสอบ tables** (ต้องทำก่อนไปขั้นตอนต่อไป):

```bash
docker exec -it openclaw-admin-postgres-1 psql -U openclaw -d openclaw_admin -c "\dt"
```

ต้องเห็น 4 tables: `admin_users`, `webchat_rooms`, `webchat_messages`, `webchat_room_users`

ถ้าไม่เห็น tables ให้รัน:

```bash
docker compose down -v && docker compose up -d --build
```

---

## ขั้นตอนที่ 9 — ติดตั้ง openclaw-api

### 9.1 Clone repo

```bash
git clone https://github.com/bosocmputer/openclaw-api.git ~/openclaw-api
cd ~/openclaw-api
npm install
```

### 9.2 สร้างไฟล์ .env

**ขั้นตอนที่ 1** — สร้าง HOOKS_TOKEN:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

copy ค่าที่ได้ไว้ก่อน

**ขั้นตอนที่ 2** — สร้างไฟล์ .env:

```bash
nano ~/openclaw-api/.env
```

วางข้อความนี้ แล้วแก้ `POSTGRES_PASSWORD_HERE` เป็นรหัสผ่านเดียวกับที่ตั้งในขั้นตอนที่ 8:

```env
API_TOKEN=sml-openclaw-2026
PORT=4000
DATABASE_URL=postgresql://openclaw:POSTGRES_PASSWORD_HERE@localhost:5432/openclaw_admin
HOOKS_TOKEN=วางค่าที่ได้จาก node ด้านบน
```

> **สำคัญ**: `POSTGRES_PASSWORD_HERE` ต้องเป็นรหัสผ่านเดียวกับ `POSTGRES_PASSWORD` ใน `~/openclaw-admin/.env`
> และ URL ต้องใช้ `localhost` เสมอ — ห้ามใส่ IP address อื่น

บันทึก: กด `Ctrl+X` → `Y` → `Enter`

### 9.3 รันด้วย pm2

```bash
cd ~/openclaw-api
pm2 start index.js --name openclaw-api
pm2 save
pm2 startup
```

คำสั่ง `pm2 startup` จะแสดงคำสั่งให้รันต่อ — **copy แล้วรันทันที** (แต่ละเครื่องจะต่างกัน):

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u <user> --hp /home/<user>
```

ตรวจสอบ:

```bash
pm2 status
```

ต้องเห็น `openclaw-api` สถานะ `online`

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
2. ถ้าเห็น banner สีเหลือง **"Telegram ยังไม่ได้เปิดใช้งาน"** → กด **เปิดใช้งาน Telegram** ก่อน
3. กด **เพิ่ม Bot ใหม่**
4. กรอก Account ID (ชื่อสั้นๆ เช่น `sale`, `stock`)
5. วาง Bot Token จาก @BotFather
6. กด **Add Bot**

> **หมายเหตุ**: wizard ตอน onboard จะตั้ง `telegram.enabled = false` เสมอ — ต้องเปิดด้วยตัวเองที่นี่

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

> Hooks ควรตั้งไว้แล้วตั้งแต่ขั้นตอนที่ 7.2 — ถ้ายังไม่ได้ตั้ง ให้ทำตามขั้นตอนที่ 7.2 ก่อน

Restart gateway หลังแก้ config:

```bash
# ถ้ารันผ่าน pm2
pm2 restart openclaw-gateway

# ถ้ารันผ่าน systemd
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

1. ไปที่เมนู **Telegram** — ถ้าเห็น banner สีเหลือง **"Telegram ยังไม่ได้เปิดใช้งาน"** → กด **เปิดใช้งาน Telegram** ก่อน
2. เช็ค **Dashboard → Config Health** — ถ้าไม่ Valid กด Auto Fix
3. เช็คว่า Bot ผูก Agent ไว้แล้วใน **Telegram**
4. เช็คว่า User ID ถูก add ไว้ใน **Agents → Users** แล้ว
5. ลอง **Restart Gateway** จาก Dashboard

### Webchat สร้างห้องไม่ได้ (error: role "openclaw" does not exist)

PostgreSQL ยังไม่มี user `openclaw` — เกิดจาก `POSTGRES_PASSWORD` ใน `.env` ไม่ถูกต้อง หรือ volume ถูกสร้างก่อนที่จะตั้ง `.env`

```bash
# ลบ volume เก่าแล้วสร้างใหม่ (ข้อมูลใน PostgreSQL จะหายทั้งหมด)
cd ~/openclaw-admin
docker compose down -v
docker compose up -d
```

> ใช้ได้เฉพาะตอนติดตั้งใหม่เท่านั้น — ถ้ามีข้อมูลอยู่แล้วให้แจ้ง admin ก่อน

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
