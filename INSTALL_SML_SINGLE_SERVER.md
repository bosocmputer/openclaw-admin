# คู่มือติดตั้ง OpenClaw สำหรับร้านใหม่บน Server เดียวกับ SML

> Version สำหรับติดตั้งจริงบน Ubuntu server ที่มี SML ERP อยู่แล้ว
>
> ปรับปรุงจากเคสติดตั้งร้านศรีทอง วันที่ 2026-07-03
>
> เป้าหมาย: ติดตั้ง OpenClaw Admin, API, Gateway runtime, Telegram bot, MCP connection และ Monitor โดยไม่ชน port/database ของ SML

---

## 0. สรุปค่ามาตรฐานของคู่มือนี้

คู่มือนี้ตั้งใจให้ติดตั้งทั้งหมดไว้ใต้ `/data` และหลีกเลี่ยง port ที่ SML มักใช้อยู่แล้ว

| รายการ | ค่าในคู่มือนี้ | เหตุผล |
| --- | --- | --- |
| OpenClaw state | `/data/openclaw-state/.openclaw` | ไม่เก็บ state สำคัญไว้ใต้ `/root` ตรง ๆ |
| `/root/.openclaw` | symlink ไป `/data/openclaw-state/.openclaw` | runtime/API ยังหา state ที่ path เดิมได้ |
| Admin repo | `/data/openclaw-admin` | แยกจาก SML |
| API repo | `/data/openclaw-api` | แยกจาก SML |
| Runtime overlay dir | `/data/openclaw-runtime-2026.6.11-erp` | ใช้ runtime skeleton + ERP overlay ที่ pin release |
| npm global | `/data/npm-global` | ไม่พึ่ง default npm global path |
| Admin web port | `13000` | ไม่ชน SML ที่อาจใช้ `3000` |
| OpenClaw PostgreSQL host port | `15432` | ไม่ชน SML PostgreSQL ที่ใช้ `5432` |
| OpenClaw API port | `4000` | ให้ Admin proxy เรียก API |
| Gateway hooks port | `127.0.0.1:18789` | เปิดเฉพาะ localhost |
| Agent ID | `admin` | ต้องเป็น ASCII เท่านั้น |

**กฎสำคัญ:** `Agent ID` ห้ามใช้ภาษาไทยหรือช่องว่าง เช่น `admin-ศรีทอง` เพราะ runtime/session path และ monitor อาจอ่านคนละ agent ได้ ให้ใช้ `admin`, `sales`, `stock`, `sritong-admin` แล้วใส่ชื่อร้านภาษาไทยใน Business Profile หรือ SOUL แทน

---

## 1. ข้อมูลที่ต้องเตรียมก่อนติดตั้ง

| ข้อมูล | ตัวอย่าง | หมายเหตุ |
| --- | --- | --- |
| Server IP | `192.168.2.21` | ใช้เปิดหน้า Admin |
| Telegram bot token | จาก `@BotFather` | ห้ามส่งในแชตสาธารณะ |
| OpenRouter API key | `sk-or-v1-...` | ใช้ทดสอบ model |
| MCP URL | `http://SERVER_IP:3515/sse` | จาก SML MCP Connect |
| Admin password ใหม่ | ตั้งเอง | ต้องเปลี่ยนหลัง login ครั้งแรก |
| ชื่อร้าน | เช่น `ศรีทอง` | ใส่ใน Business Profile ไม่ใช่ Agent ID |

---

## 2. ตรวจ server ก่อนเริ่ม

รันคำสั่งนี้แล้วตรวจผลก่อนติดตั้ง

```bash
lsb_release -a || cat /etc/os-release
uname -r
whoami && id
nproc
free -h
df -h /
node --version || true
npm --version || true
docker --version || true
docker compose version || true
pm2 --version || true
openclaw --version || true
ufw status || true
ss -ltnp | grep -E ':3000|:4000|:5432|:15432|:18789|:80|:443' || true
```

ค่าที่ควรเห็น:

- Ubuntu 22.04 LTS หรือใหม่กว่า
- login เป็น `root` หรือ user ที่ใช้ `sudo` ได้
- RAM อย่างน้อย 8 GB, แนะนำ 16 GB+
- disk `/` หรือ `/data` เหลืออย่างน้อย 30 GB
- ถ้ามี SML อยู่แล้วและใช้ port `3000` หรือ `5432` ให้ใช้ port OpenClaw ตามคู่มือนี้เท่านั้น

ถ้าระหว่าง `apt upgrade` เจอหน้าจอ `Pending kernel upgrade` ให้กด `OK` ได้ หลังติดตั้ง kernel เสร็จควร reboot แล้วเช็ก:

```bash
reboot
uname -r
```

---

## 3. ติดตั้ง package พื้นฐาน

```bash
apt update
apt install -y curl git nano ca-certificates gnupg openssl rsync python3
```

---

## 4. ติดตั้ง Node.js 22

ถ้าเครื่องยังไม่มี Node.js:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

ตรวจสอบ:

```bash
node --version
npm --version
```

ค่าที่ใช้ผ่านในเคสจริง:

```text
node v22.23.1
npm 10.9.8
```

---

## 5. ตรวจ Docker

ถ้าเครื่องยังไม่มี Docker:

```bash
curl -fsSL https://get.docker.com | bash
```

ตรวจสอบ:

```bash
docker --version
docker compose version
```

---

## 6. ตั้งค่า npm global ไว้ใต้ `/data`

```bash
mkdir -p /data/npm-global
npm config set prefix '/data/npm-global'

grep -q '/data/npm-global/bin' /root/.bashrc || \
  echo 'export PATH="/data/npm-global/bin:$PATH"' >> /root/.bashrc

source /root/.bashrc
hash -r
```

ติดตั้ง `pm2` และ `openclaw` CLI:

```bash
npm install -g pm2 openclaw@2026.6.11
```

ตรวจสอบ:

```bash
node --version
npm --version
pm2 --version
openclaw --version
```

ถ้า `npm install -g` เจอ `ENOTEMPTY` ให้ backup ของค้างแล้วลงใหม่:

```bash
TS=$(date +%Y%m%d%H%M%S)
mkdir -p /data/openclaw-backups/npm-global-$TS
mv /data/npm-global/lib/node_modules/pm2 /data/openclaw-backups/npm-global-$TS/ 2>/dev/null || true
mv /data/npm-global/lib/node_modules/.pm2-* /data/openclaw-backups/npm-global-$TS/ 2>/dev/null || true
mv /data/npm-global/bin/pm2* /data/openclaw-backups/npm-global-$TS/ 2>/dev/null || true
mv /data/npm-global/lib/node_modules/openclaw /data/openclaw-backups/npm-global-$TS/ 2>/dev/null || true
mv /data/npm-global/lib/node_modules/.openclaw-* /data/openclaw-backups/npm-global-$TS/ 2>/dev/null || true
mv /data/npm-global/bin/openclaw* /data/openclaw-backups/npm-global-$TS/ 2>/dev/null || true
npm cache verify
npm install -g pm2
npm install -g openclaw@2026.6.11
```

---

## 7. ย้าย OpenClaw state ไปไว้ใต้ `/data`

ทำก่อน `openclaw onboard` เพื่อให้ config และ session ทั้งหมดเกิดใต้ `/data`

```bash
cd /data
mkdir -p /data/openclaw-backups /data/openclaw-state/.openclaw

TS=$(date +%Y%m%d%H%M%S)
if [ -e /root/.openclaw ] && [ ! -L /root/.openclaw ]; then
  mv /root/.openclaw /data/openclaw-backups/root-openclaw-$TS
fi

ln -sfn /data/openclaw-state/.openclaw /root/.openclaw
ls -la /root/.openclaw
```

ต้องเห็น:

```text
/root/.openclaw -> /data/openclaw-state/.openclaw
```

---

## 8. สร้าง config พื้นฐาน

```bash
cd /data
source /root/.bashrc
openclaw onboard
```

ถ้า wizard ถาม model/provider ให้เลือกอะไรก็ได้ก่อน เพราะจะตั้งค่าจริงผ่านหน้า Admin ภายหลัง

ตรวจสอบ:

```bash
ls -la /data/openclaw-state/.openclaw
test -f /root/.openclaw/openclaw.json && echo "openclaw.json OK"
```

---

## 9. Generate secrets

ห้ามใช้ค่าตัวอย่าง ให้ generate ใหม่ทุกเครื่อง

```bash
cd /data
umask 077
cat > /data/openclaw-install-secrets.env <<EOF
HOOKS_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=$(openssl rand -hex 32)
API_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
EOF

ls -l /data/openclaw-install-secrets.env
```

ต้องเห็น permission ประมาณนี้:

```text
-rw------- 1 root root ... /data/openclaw-install-secrets.env
```

**อย่า paste ค่า secret ลงแชต**

---

## 10. ติดตั้ง OpenClaw ERP runtime

Release ที่ใช้:

| รายการ | ค่า |
| --- | --- |
| Runtime release | `2026.6.11-erp-20260706-line-burst-fastpath` |
| Runtime directory | `/data/openclaw-runtime-2026.6.11-erp` |
| Overlay file | `openclaw-runtime-2026.6.11-erp-line-burst-fe432925.tgz` |
| SHA256 | `a26156d0440b4d6010d89c98a94cdefa8f0d51693762874bde0d607175f94a99` |

เตรียม runtime:

- Default production path คือ build full runtime 2026.6.11 จาก source branch ที่ pin ไว้
- Overlay file ใช้ทับ runtime 2026.6.11 ที่ถูกต้องแล้วเท่านั้น หรือใช้เป็น legacy LINE-only emergency patch
- ถ้าใช้ `ollama-cloud` หรือ provider ใหม่ ต้องเห็น `OpenClaw 2026.6.11 (fe43292)` จาก `node ... --version` และ `/model` runtime test

```bash
cd /data
RUNTIME=/data/openclaw-runtime-2026.6.11-erp
NEW_RUNTIME=/data/openclaw-runtime-2026.6.11-erp.new
BACKUP=/data/openclaw-runtime-2026.6.11-erp.bak-$(date +%Y%m%d-%H%M%S)

pm2 stop openclaw-gateway || true

if [ -d "$RUNTIME" ]; then
  mv "$RUNTIME" "$BACKUP"
fi

rm -rf "$NEW_RUNTIME"
git clone --depth 1 \
  --branch codex/openclaw-2026.6.11-erp-line-burst \
  https://github.com/bosocmputer/openclaw.git \
  "$NEW_RUNTIME"

cd "$NEW_RUNTIME"
git rev-parse --short HEAD
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
pnpm build:docker
node "$NEW_RUNTIME/dist/index.js" --version
mv "$NEW_RUNTIME" "$RUNTIME"
```

ต้องเห็น `OpenClaw 2026.6.11 (fe43292)` หรือใหม่กว่า

สร้าง start script:

```bash
cat > /data/start-openclaw-gateway.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
export HOME=/root
export PATH=/data/npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

set -a
[ -f /data/openclaw-api/.env ] && . /data/openclaw-api/.env
[ -f /root/openclaw-api/.env ] && . /root/openclaw-api/.env
set +a

exec /usr/bin/node /data/openclaw-runtime-2026.6.11-erp/dist/index.js gateway --port 18789
SH

chmod +x /data/start-openclaw-gateway.sh
```

Start gateway:

```bash
pm2 delete openclaw-gateway || true
fuser -k 18789/tcp || true
pm2 start /data/start-openclaw-gateway.sh --name openclaw-gateway --cwd /data
sleep 8
pm2 list
ss -ltnp | grep 18789 || true
pm2 save
```

ควรเห็น gateway listen ที่ `127.0.0.1:18789` และ `[::1]:18789`

---

## 11. เปิด hooks ใน `openclaw.json`

```bash
cd /data
python3 - <<'PY'
import json
from pathlib import Path

secret_path = Path("/data/openclaw-install-secrets.env")
secrets = {}
for line in secret_path.read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        secrets[k.strip()] = v.strip()

path = Path("/root/.openclaw/openclaw.json")
data = json.loads(path.read_text())
data["hooks"] = {
    "enabled": True,
    "token": secrets["HOOKS_TOKEN"],
    "allowRequestSessionKey": True,
}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
PY

python3 - <<'PY'
import json
d=json.load(open("/root/.openclaw/openclaw.json"))
h=d.get("hooks", {})
print("hooks.enabled =", h.get("enabled"))
print("hooks.token =", "OK" if h.get("token") else "MISSING")
print("hooks.allowRequestSessionKey =", h.get("allowRequestSessionKey"))
PY

pm2 restart openclaw-gateway --update-env
sleep 5
pm2 list
ss -ltnp | grep 18789 || true
pm2 save
```

---

## 12. ติดตั้ง openclaw-admin บน port 13000

```bash
cd /data
git clone https://github.com/bosocmputer/openclaw-admin.git /data/openclaw-admin
cd /data/openclaw-admin
```

สร้าง `.env`:

```bash
source /data/openclaw-install-secrets.env

read -s -p "POSTGRES_PASSWORD: " POSTGRES_PASSWORD
echo

SERVER_IP=$(hostname -I | awk '{print $1}')
cat > /data/openclaw-admin/.env <<EOF
SERVER_IP=$SERVER_IP
API_TOKEN=$API_TOKEN
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
SESSION_SECRET=$SESSION_SECRET
EOF

chmod 600 /data/openclaw-admin/.env
```

แก้ `docker-compose.yml` ให้ไม่ชน SML:

```bash
cd /data/openclaw-admin
cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d%H%M%S)

python3 - <<'PY'
from pathlib import Path
p = Path("docker-compose.yml")
s = p.read_text()
s = s.replace("postgres_data:/var/lib/postgresql/data", "/data/openclaw-postgres:/var/lib/postgresql/data")
s = s.replace('"5432:5432"', '"15432:5432"')
s = s.replace('"3000:3000"', '"13000:3000"')
s = s.replace("\nvolumes:\n  postgres_data:\n", "\n")
p.write_text(s)
PY

grep -n '13000\|3000\|15432\|5432\|openclaw-postgres' docker-compose.yml
```

รัน Docker:

```bash
mkdir -p /data/openclaw-postgres
docker compose up -d --build
docker compose ps
```

ต้องเห็น:

```text
0.0.0.0:13000->3000/tcp
0.0.0.0:15432->5432/tcp
```

เปิดหน้าเว็บ:

```text
http://SERVER_IP:13000
```

Login ครั้งแรก:

```text
superadmin / superadmin
```

หลังเข้าได้ ให้เปลี่ยนรหัสผ่านทันที

---

## 13. ติดตั้ง openclaw-api

```bash
cd /data
git clone https://github.com/bosocmputer/openclaw-api.git /data/openclaw-api
cd /data/openclaw-api
npm ci --omit=dev
```

สร้าง `.env`:

```bash
cd /data/openclaw-api
source /data/openclaw-install-secrets.env
POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' /data/openclaw-admin/.env | cut -d= -f2-)
SERVER_IP=$(grep -E '^SERVER_IP=' /data/openclaw-admin/.env | cut -d= -f2-)

cat > /data/openclaw-api/.env <<EOF
API_TOKEN=$API_TOKEN
PORT=4000
DATABASE_URL=postgresql://openclaw:${POSTGRES_PASSWORD}@localhost:15432/openclaw_admin
HOOKS_TOKEN=$HOOKS_TOKEN
ALLOWED_ORIGIN=http://${SERVER_IP}:13000
OPENCLAW_BIN=/data/openclaw-runtime-2026.6.11-erp/dist/index.js
CONVERSATION_ANALYSIS_ENABLED=1
MEMORY_LEARNING_REVIEW_ENABLED=1
MONITOR_MEDIA_PREVIEW_ENABLED=1
EOF

chmod 600 /data/openclaw-api/.env
```

Start API:

```bash
pm2 delete openclaw-api || true
pm2 start /data/openclaw-api/index.js --name openclaw-api --cwd /data/openclaw-api
sleep 5
pm2 list
pm2 save
```

ตั้ง pm2 auto-start หลัง reboot:

```bash
pm2 startup
```

คำสั่งนี้จะพิมพ์คำสั่ง `sudo/env ... pm2 startup ...` ออกมา ให้ copy คำสั่งที่เครื่องแสดงแล้วรันทันที จากนั้น:

```bash
pm2 save
```

ตรวจ API:

```bash
TOKEN=$(grep -E '^API_TOKEN=' /data/openclaw-api/.env | cut -d= -f2-)
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4000/api/status | python3 -m json.tool
```

---

## 14. ตั้ง Agent, Model, MCP และ Telegram ในหน้า Admin

เปิด:

```text
http://SERVER_IP:13000
```

### 14.1 Model

1. ไปที่เมนู **Model**
2. ใส่ OpenRouter API key
3. กด **ทดสอบ key** ต้องผ่าน
4. เลือก model เช่น:
   - Primary: `openrouter/google/gemini-2.5-flash-lite`
   - Fallback 1: `openrouter/qwen/qwen3.5-flash-02-23`
   - Fallback 2: `openrouter/openai/gpt-4o-mini`
5. กด **ทดสอบ model นี้** ให้ผ่านทุกตัว
6. Save

ถ้า model test ผ่านบ้างไม่ผ่านบ้าง ให้ตรวจ log:

```bash
pm2 logs openclaw-gateway --lines 120 --nostream
pm2 logs openclaw-api --lines 120 --nostream
```

ถ้าเจอปัญหา model allowlist ให้รัน:

```bash
openclaw config set agents.defaults.models '{"openrouter/*":{}}' --strict-json --merge
pm2 restart openclaw-gateway --update-env
pm2 restart openclaw-api --update-env
pm2 save
```

### 14.2 Agent

สร้าง agent ด้วยค่า:

| Field | ค่า |
| --- | --- |
| Agent ID | `admin` |
| Access Mode | `admin` |
| Workspace | ใช้ default หรือ `workspace-admin` |

**ห้ามตั้ง Agent ID เป็นภาษาไทย** เช่น `admin-ศรีทอง`

### 14.3 Business Profile

ไปที่ **Business Profiles** แล้วสร้าง profile ของร้าน เช่น:

- `name`: `sritong`
- `name_th`: `ศรีทอง`
- `business_type`: ธุรกิจของร้าน เช่น วัสดุก่อสร้างและอุปกรณ์งานช่าง

จากนั้น link profile เข้ากับ agent `admin`

### 14.4 MCP

ไปที่ **Agents -> admin -> MCP**

ตั้งค่า:

```text
URL: http://SERVER_IP:3515/sse
Access Mode: admin
```

กด:

1. **Ping** ต้องผ่าน
2. **Test Access** ต้องเห็น tools
3. **Save MCP**

ตรวจด้วย command:

```bash
curl -sS http://127.0.0.1:3515/tools -H "mcp-access-mode: admin" | head
```

ถ้า MCP ไม่ได้อยู่เครื่องเดียวกัน ให้เปลี่ยน `127.0.0.1` เป็น IP ของเครื่อง MCP

### 14.5 Telegram

ไปที่ **Telegram**

1. เปิดใช้งาน Telegram
2. เพิ่ม bot account เช่น `ai_shop_admin_bot`
3. ใส่ token จาก `@BotFather`
4. ผูก bot เข้ากับ agent `admin`
5. เพิ่ม Telegram user id ที่อนุญาตใช้งาน
6. Save และ Restart Gateway

ถ้าใน config มี `streaming: "partial"` แล้ว model test/Telegram มีปัญหา ให้ลบ field นี้ออก:

```bash
python3 - <<'PY'
import json
from pathlib import Path
p = Path("/root/.openclaw/openclaw.json")
d = json.loads(p.read_text())
accounts = (((d.get("channels") or {}).get("telegram") or {}).get("accounts") or {})
for cfg in accounts.values():
    if isinstance(cfg, dict):
        cfg.pop("streaming", None)
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
PY

pm2 restart openclaw-gateway --update-env
pm2 save
```

---

## 15. Fix auth profile warning

ถ้าหน้า `/system` ขึ้น:

```text
auth-profiles.json missing
```

ให้ rotate OpenRouter key เข้า agent auth profile:

```bash
read -s -p "OPENROUTER_API_KEY: " OPENROUTER_KEY
echo

OPENROUTER_KEY="$OPENROUTER_KEY" node - <<'NODE'
const fs = require('fs')
const path = require('path')
const configPath = '/root/.openclaw/openclaw.json'
const stateDir = '/root/.openclaw'
const key = process.env.OPENROUTER_KEY
if (!key) throw new Error('OPENROUTER_KEY missing')

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
let count = 0
for (const agent of config.agents?.list || []) {
  const authPath = path.join(stateDir, 'agents', agent.id, 'agent', 'auth-profiles.json')
  fs.mkdirSync(path.dirname(authPath), { recursive: true })
  let store = { version: 1, profiles: {} }
  try { store = JSON.parse(fs.readFileSync(authPath, 'utf8')) } catch {}
  store.version ||= 1
  store.profiles ||= {}
  const ids = Object.keys(store.profiles).filter(id => id === 'openrouter:default' || id.startsWith('openrouter:'))
  if (ids.length === 0) ids.push('openrouter:default')
  for (const id of ids) {
    const existing = store.profiles[id] || {}
    store.profiles[id] = { ...existing, type: 'api_key', provider: 'openrouter', key }
  }
  if (fs.existsSync(authPath)) fs.copyFileSync(authPath, `${authPath}.bak.${Date.now()}`)
  const tmp = `${authPath}.tmp.${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, authPath)
  count++
}
config.env ||= {}
config.env.OPENROUTER_API_KEY = key
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
console.log(`updated auth profiles: ${count}`)
NODE

pm2 restart openclaw-gateway --update-env
pm2 restart openclaw-api --update-env
pm2 save
```

---

## 16. ทดสอบหลังติดตั้ง

### 16.1 ตรวจ process และ ports

```bash
pm2 list
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
ss -ltnp | grep -E ':13000|:15432|:4000|:18789|:3515' || true
```

ต้องเห็นอย่างน้อย:

- `openclaw-gateway` online
- `openclaw-api` online
- `openclaw-admin-openclaw-admin-1` up
- `openclaw-admin-postgres-1` up
- `13000->3000`
- `15432->5432`
- `127.0.0.1:18789`

### 16.2 ตรวจ health

```bash
cd /data/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4000/api/system/health?refresh=true" \
  | python3 -m json.tool
```

ในหน้าเว็บให้เปิด:

```text
http://SERVER_IP:13000/system
```

กด **Run Health Check**

### 16.3 ทดสอบ Model runtime

```bash
cd /data/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -X POST "http://127.0.0.1:4000/api/models/message-test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"primary":"openrouter/google/gemini-2.5-flash-lite","fallbacks":["openrouter/qwen/qwen3.5-flash-02-23","openrouter/openai/gpt-4o-mini"],"prompt":"สวัสดีครับ","capability":"text","refresh":true}' \
  | python3 -m json.tool
```

ต้องได้ `ok: true`

ถ้า primary บางครั้งเจอ provider error แต่ fallback ตอบได้ ให้ถือว่า fallback ทำงาน แต่ควรดู quota/rate limit ของ provider

### 16.4 ทดสอบ Telegram

ใน Telegram ส่ง:

```text
/reset
สวัสดี
คุณมี tools อะไรบ้าง
ขอตัวอย่างสินค้า 1 ตัว เพื่อทดสอบ MCP
```

บอทต้องตอบ และถ้าถาม tools ต้องเห็นรายการ ERP tools เช่น ค้นหาสินค้า, ตรวจสต็อก, ตรวจราคา, ลูกค้า, ผู้จำหน่าย, วิเคราะห์ยอดขาย

### 16.5 ตรวจ Monitor

เปิด:

```text
http://SERVER_IP:13000/monitor
```

ต้องเห็นข้อความ Telegram ที่เพิ่งส่ง

ถ้าไม่เห็น ให้ตรวจ:

```bash
cd /data/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -G "http://127.0.0.1:4000/api/monitor/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "minutes=240" \
  --data-urlencode "channel=telegram" \
  --data-urlencode "limit=20" \
  | python3 -m json.tool

python3 - <<'PY'
import json
from pathlib import Path
base = Path("/root/.openclaw/agents")
for d in sorted(p for p in base.iterdir() if p.is_dir()):
    sp = d / "sessions" / "sessions.json"
    files = list((d / "sessions").glob("*.jsonl")) if (d / "sessions").exists() else []
    print("agent =", d.name, "sessions.json =", sp.exists(), "jsonl =", len(files))
    if sp.exists():
        data = json.loads(sp.read_text())
        print("  keys =", len(data))
        for k, v in list(data.items())[-5:]:
            print(" ", k, "file=", v.get("sessionFile"), "id=", v.get("sessionId"))
PY
```

ถ้า session อยู่ใต้ `agents/admin` แต่หน้าเว็บมี agent ชื่ออื่น แปลว่า Agent ID ไม่ตรง ให้ rename เป็น `admin`

### 16.6 Backfill Conversation Analysis

```bash
cd /data/openclaw-api
TOKEN=$(grep -E '^API_TOKEN=' .env | cut -d= -f2-)

curl -sS -X POST "http://127.0.0.1:4000/api/analysis/conversations/backfill" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days":1,"channel":"telegram"}' \
  | python3 -m json.tool
```

เปิด:

```text
http://SERVER_IP:13000/analysis/conversations
```

ต้องเห็น conversation turns

---

## 17. ถ้าเผลอตั้ง Agent ID เป็นภาษาไทย

ตัวอย่างปัญหา:

- Admin/System แสดง agent `admin-ศรีทอง`
- runtime เขียน session จริงที่ `agents/admin`
- `/monitor` และ `/analysis/conversations` ว่าง แม้ Telegram ตอบได้

ให้เปลี่ยนกลับเป็น `admin`:

```bash
cd /data

OLD='admin-ศรีทอง'
NEW='admin'
TS=$(date +%Y%m%d%H%M%S)
BK="/data/openclaw-backups/rename-agent-$TS"
mkdir -p "$BK"

cp -a /root/.openclaw/openclaw.json "$BK/openclaw.json"
cp -a /root/.openclaw/agents "$BK/agents"

mkdir -p "/root/.openclaw/agents/$NEW"

if [ -d "/root/.openclaw/agents/$OLD" ] && [ ! -L "/root/.openclaw/agents/$OLD" ]; then
  rsync -a --exclude 'sessions/' "/root/.openclaw/agents/$OLD/" "/root/.openclaw/agents/$NEW/"
  mv "/root/.openclaw/agents/$OLD" "$BK/agent-$OLD"
fi

ln -sfn "/root/.openclaw/agents/$NEW" "/root/.openclaw/agents/$OLD"

python3 - <<'PY'
import json
from pathlib import Path

old = "admin-ศรีทอง"
new = "admin"
p = Path("/root/.openclaw/openclaw.json")
d = json.loads(p.read_text())

agents = d.get("agents", {}).get("list", [])
old_agent = next((a for a in agents if isinstance(a, dict) and a.get("id") == old), None)
new_agent = next((a for a in agents if isinstance(a, dict) and a.get("id") == new), None)

if old_agent:
    merged = dict(old_agent)
    merged["id"] = new
    if new_agent:
        merged.update({k: v for k, v in new_agent.items() if v is not None})
        merged["id"] = new
    d.setdefault("agents", {})["list"] = [
        a for a in agents
        if not (isinstance(a, dict) and a.get("id") in (old, new))
    ] + [merged]

for b in d.get("bindings", []) or []:
    if isinstance(b, dict) and b.get("agentId") == old:
        b["agentId"] = new

servers = ((d.get("mcp") or {}).get("servers") or {})
if old in servers:
    if new not in servers:
        servers[new] = servers[old]
    del servers[old]

p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
print("agents =", [a.get("id") for a in d.get("agents", {}).get("list", [])])
print("bindings =", d.get("bindings", []))
print("mcp servers =", list(((d.get("mcp") or {}).get("servers") or {}).keys()))
PY

docker exec -i openclaw-admin-postgres-1 psql -U openclaw -d openclaw_admin <<'SQL'
UPDATE business_profile_agent_links SET agent_id='admin' WHERE agent_id='admin-ศรีทอง';
UPDATE conversation_turns SET agent_id='admin' WHERE agent_id='admin-ศรีทอง';
UPDATE sale_orders SET agent_id='admin' WHERE agent_id='admin-ศรีทอง';
UPDATE webchat_rooms
SET agent_id='admin'
WHERE agent_id='admin-ศรีทอง'
  AND NOT EXISTS (SELECT 1 FROM webchat_rooms WHERE agent_id='admin');
SQL

pm2 restart openclaw-gateway --update-env
pm2 restart openclaw-api --update-env
pm2 save
```

ทดสอบใหม่ด้วย `/monitor`

---

## 18. Firewall

ถ้า `ufw inactive` ไม่ต้องทำอะไร

ถ้า `ufw active` และต้องให้เครื่องใน LAN เข้า Admin ได้:

```bash
ufw allow 13000/tcp
ufw allow from 172.16.0.0/12 to any port 4000
ufw reload
ufw status
```

ไม่ควรเปิด port เหล่านี้ออก public internet:

- `15432` PostgreSQL
- `4000` API
- `18789` Gateway hooks

ถ้าจำเป็นต้องเปิดใช้งานนอก LAN ให้ทำผ่าน VPN หรือ reverse proxy ที่มี auth

---

## 19. Warning ที่เจอได้และความหมาย

### `Pending kernel upgrade`

เป็นข้อความจาก Ubuntu หลัง update kernel ให้กด `OK` ได้ แล้ว reboot เมื่อสะดวก

### `Control UI assets are missing`

ไม่กระทบ Telegram/Admin API ใน setup นี้ เพราะเราใช้ `openclaw-admin` เป็นหน้า control หลัก

### `security warning: dangerous config flags enabled`

เกิดจาก `hooks.allowRequestSessionKey=true` ใช้เพื่อให้ Webchat/Admin คุยกับ gateway ได้ ควรจำกัด firewall ให้ gateway อยู่บน localhost และ API ไม่เปิด public

### `release.metadata warn`

มักเกิดจาก manual deploy runtime overlay ใต้ `/data` โดยไม่ได้ใช้ update script แบบเต็ม ไม่ใช่ blocker ถ้า:

- runtime version ถูกต้อง
- gateway online
- model test ผ่าน
- Telegram regression ผ่าน
- monitor เห็นข้อความ

### `runtime.guardrails info`

ถ้าเพิ่งเปลี่ยน runtime ให้ทดสอบ Telegram จริง แล้วกด confirm regression ใน Dashboard/System

### `telemetry.telegram info`

ถ้า Monitor เห็นข้อความแล้วถือว่าไม่ใช่ปัญหาหลัก บาง runtime ไม่มี marker ครบทุกตัว

---

## 20. คำสั่งตรวจหลัง reboot

หลัง reboot server:

```bash
source /root/.bashrc
pm2 list
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
ss -ltnp | grep -E ':13000|:15432|:4000|:18789|:3515' || true
curl -I --max-time 5 http://127.0.0.1:4000/api/status || true
```

ถ้า pm2 ไม่ขึ้น:

```bash
source /root/.bashrc
pm2 resurrect
pm2 list
```

---

## 21. ข้อมูลที่ต้องบันทึกส่งมอบ

| รายการ | ค่า |
| --- | --- |
| วันที่ติดตั้ง | |
| ผู้ติดตั้ง | |
| Server IP | |
| Admin URL | `http://SERVER_IP:13000` |
| Admin username | `superadmin` หรือ user ใหม่ |
| Admin password | บันทึกในที่ปลอดภัย |
| OpenClaw runtime overlay release | `2026.6.11-erp-20260706-line-burst-fastpath` |
| Runtime SHA256 | `a26156d0440b4d6010d89c98a94cdefa8f0d51693762874bde0d607175f94a99` |
| API port | `4000` |
| Admin port | `13000` |
| PostgreSQL port | `15432` |
| Gateway port | `127.0.0.1:18789` |
| Agent ID | `admin` |
| Telegram account id | |
| Telegram bot username | |
| MCP URL | |
| Model primary | |
| Model fallbacks | |
| `/system` health result | |
| `/monitor` เห็นข้อความแล้ว | yes/no |
| `/analysis/conversations` backfill แล้ว | yes/no |

---

## 22. Rollback เบื้องต้น

ถ้า gateway runtime มีปัญหา:

```bash
ls -la /data/openclaw-backups
```

เลือก backup runtime ล่าสุด แล้ว restore:

```bash
BK=/data/openclaw-backups/runtime-YYYYMMDDHHMMSS
rm -rf /data/openclaw-runtime-2026.6.11-erp/dist
cp -a "$BK/dist" /data/openclaw-runtime-2026.6.11-erp/dist
rm -rf /data/openclaw-runtime-2026.6.11-erp/extensions/line/src
cp -a "$BK/line-src" /data/openclaw-runtime-2026.6.11-erp/extensions/line/src 2>/dev/null || true
cp -a "$BK/app-navigation.ts" /data/openclaw-runtime-2026.6.11-erp/ui/src/app-navigation.ts 2>/dev/null || true
cp -a "$BK/start-openclaw-gateway.sh" /data/start-openclaw-gateway.sh 2>/dev/null || true
pm2 restart openclaw-gateway --update-env
pm2 save
```

ถ้า config พัง:

```bash
ls -la /data/openclaw-backups
cp /data/openclaw-backups/<backup-folder>/openclaw.json /root/.openclaw/openclaw.json
pm2 restart openclaw-gateway --update-env
pm2 restart openclaw-api --update-env
pm2 save
```

---

## 23. Checklist ส่งมอบ

- [ ] Node.js และ npm ใช้งานได้
- [ ] Docker และ docker compose ใช้งานได้
- [ ] `pm2 --version` ผ่าน
- [ ] `openclaw --version` ผ่าน
- [ ] `/root/.openclaw` symlink ไป `/data/openclaw-state/.openclaw`
- [ ] runtime overlay checksum ผ่าน
- [ ] `openclaw-gateway` online
- [ ] `openclaw-api` online
- [ ] `openclaw-admin` container up
- [ ] PostgreSQL container up ที่ port `15432`
- [ ] Admin เปิดได้ที่ `http://SERVER_IP:13000`
- [ ] เปลี่ยนรหัสผ่าน `superadmin` แล้ว
- [ ] Agent ID เป็น `admin` หรือ ASCII เท่านั้น
- [ ] Business Profile ใส่ชื่อร้านภาษาไทยแล้ว
- [ ] MCP Ping/Test Access ผ่าน และเห็น tools
- [ ] Model key test ผ่าน
- [ ] Model runtime test ผ่าน
- [ ] Telegram bot ตอบ `/reset` และ `สวัสดี`
- [ ] Telegram ถาม tools แล้วเห็น ERP tools
- [ ] ทดสอบถามสินค้า/stock/price ผ่าน MCP แล้ว
- [ ] `/monitor` เห็นข้อความ Telegram
- [ ] Backfill Conversation Analysis แล้วเห็น turns
- [ ] `/system` ไม่มี critical fail
- [ ] จดข้อมูลส่งมอบครบ
