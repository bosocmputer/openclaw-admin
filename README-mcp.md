# SML MCP Connect

Standalone MCP Server สำหรับ SML ERP — เชื่อมต่อ PostgreSQL กับ AI Agents ผ่าน Model Context Protocol (MCP)

รองรับ 3 transport modes: **stdio**, **SSE (legacy)**, **Streamable HTTP (modern)**

---

## สารบัญ

- [การติดตั้ง](#การติดตั้ง)
- [Environment Variables](#environment-variables)
- [Role-Based Access Control](#role-based-access-control)
- [Tools ที่รองรับ](#tools-ที่รองรับ)
- [Endpoint Reference](#endpoint-reference)
- [Agent Guide: แต่ละ Mode](#agent-guide-แต่ละ-mode)
  - [Mode 1: stdio](#mode-1-stdio)
  - [Mode 2: HTTP/SSE](#mode-2-httpsse-legacy)
  - [Mode 3: Streamable HTTP](#mode-3-streamable-http)
  - [Mode 4: Direct REST /call](#mode-4-direct-rest-call)
- [Agent Flow: ใบสั่งจอง (Sale Reservation)](#agent-flow-ใบสั่งจอง-sale-reservation)
- [Claude Desktop Config](#claude-desktop-config)
- [การตั้งค่า Config](#การตั้งค่า-config)
- [Docker](#docker)

---

## การติดตั้ง

```bash
npm install
npm run build
cp .env.example .env
# แก้ค่า DB_HOST, DB_NAME, DB_USER, DB_PASSWORD ใน .env
```

---

## Environment Variables

| Variable | ค่าตัวอย่าง | คำอธิบาย |
|---|---|---|
| `TRANSPORT` | `stdio` / `sse` / `streamable-http` | Transport mode (default: `stdio`) |
| `PORT` | `3002` | HTTP port |
| `DB_HOST` | `your_ip_server` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `your_erp_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `secret` | Database password |
| `DB_SSL` | `false` | เปิด SSL หรือไม่ |
| `MCP_TOOLS` | `*` | Tools ที่ enable (`*` = ทุก tool) |
| `MCP_ACCESS_MODE` | `admin` | default role fallback เมื่อ agent ไม่ส่ง header มา |
| `CONFIG_URL` | `http://config-svc/api/config` | โหลด config จาก URL (optional) |
| `CONFIG_PATH` | `/app/config.json` | โหลด config จาก file (optional) |

**Config Priority:** ENV Variables → CONFIG_PATH → CONFIG_URL → config.json

---

## Role-Based Access Control

แต่ละ agent ประกาศ role ของตัวเองมาผ่าน header `mcp-access-mode`:

```
Agent (sales)    →  header: mcp-access-mode: sales   →  เห็น price, customer
Agent (purchase) →  header: mcp-access-mode: purchase →  เห็น cost, supplier
Agent (admin)    →  header: mcp-access-mode: admin    →  เห็นทุกอย่าง + analytics
ไม่ส่ง header    →  ใช้ค่า MCP_ACCESS_MODE จาก env   →  fallback
```

### Permission Matrix

| | cost | price | customer | supplier | bookout | outstanding | incoming | analytics/CRM |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `sales` | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `purchase` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `stock` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `general` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **หมายเหตุ:** tools กลุ่ม analytics/CRM (sales analytics, CRM) มองเห็นได้เฉพาะ `admin` เท่านั้น

---

## Tools ที่รองรับ

| กลุ่ม | Tool | Role ขั้นต่ำ |
|---|---|---|
| **Search** | `search_product`, `search_customer`, `search_supplier` | general / sales / purchase |
| **Inventory** | `get_stock_balance`, `get_product_price` | general+ |
| **Inventory** | `get_bookout_balance`, `get_account_outstanding` | sales, stock, admin |
| **Inventory** | `get_account_incoming` | purchase, stock, admin |
| **Sales Analytics** | `get_sales_summary`, `get_sales_by_item`, `get_sales_by_customer`, `get_sales_by_salesman`, `get_sales_by_branch`, `get_sales_by_area`, `get_sales_by_dimension`, `get_sales_item_detail`, `get_document_summary`, `get_customer_top_items`, `get_item_top_buyers`, `get_sales_conversion_rate`, `get_new_customer_trend`, `get_dso_analysis` | **admin only** |
| **CRM** | `get_customer_rfm`, `get_customer_activity_status`, `get_customer_credit_status`, `get_customer_profitability`, `get_customer_purchase_frequency`, `get_customer_segment_summary`, `get_salesman_crm_kpi` | **admin only** |
| **Write** | `create_sale_reserve` | admin, sales — ผ่าน `/api/sale_reserve` เท่านั้น |
| **System** | `fallback_response` | ทุก role |

```bash
MCP_TOOLS=*                                    # เปิดทุก tool
MCP_TOOLS=search_product,get_stock_balance     # เปิดเฉพาะบาง tool
```

---

## Endpoint Reference

HTTP server รันอยู่เสมอ ไม่ว่าจะ TRANSPORT mode ไหน

| Endpoint | Method | คำอธิบาย | Role |
|---|---|---|---|
| `GET /health` | GET | ตรวจสอบสถานะ server | ทุกคน |
| `GET /tools` | GET | รายการ tools ที่ enable (filter ตาม role) | ทุกคน |
| `POST /call` | POST | เรียก tool โดยตรง (ไม่ผ่าน MCP protocol) | header `mcp-access-mode` |
| `POST /reload` | POST | Reload config โดยไม่ restart server | ทุกคน |
| `POST /mcp` | POST | **Streamable HTTP** — MCP modern transport | header `mcp-access-mode` |
| `GET /mcp` | GET | **Streamable HTTP** — SSE stream สำหรับ response | header `mcp-access-mode` |
| `DELETE /mcp` | DELETE | ปิด MCP session | - |
| `GET /sse` | GET | **SSE legacy** — เปิด SSE connection รับ sessionId | header `mcp-access-mode` |
| `POST /message?sessionId=xxx` | POST | **SSE legacy** — ส่ง MCP message ผ่าน sessionId | - |
| `POST /api/sale_reserve` | POST | **Write endpoint** — สร้างใบสั่งจอง | admin, sales เท่านั้น |

### ความแตกต่างระหว่าง `/call` และ `/mcp`

| | `/call` (Direct REST) | `/mcp` (Streamable HTTP) |
|---|---|---|
| Protocol | REST ธรรมดา | MCP protocol (JSON-RPC 2.0) |
| เหมาะกับ | n8n HTTP node, webhook, script | MCP clients (Claude, Cursor, Dify) |
| Write tools | ❌ ไม่รองรับ | ❌ ไม่รองรับ |
| Format request | `{ "name": "...", "arguments": {...} }` | `{ "jsonrpc": "2.0", "method": "tools/call", ... }` |

### `/api/sale_reserve` vs `/mcp`

| | `/mcp` | `/api/sale_reserve` |
|---|---|---|
| Tools ที่เห็น | ทุก tool ยกเว้น write | เฉพาะ `create_sale_reserve` |
| Role | ทุก role | **admin, sales เท่านั้น** (403 ถ้า role อื่น) |
| Protocol | MCP Streamable HTTP | MCP Streamable HTTP |

---

## Agent Guide: แต่ละ Mode

### Mode 1: stdio

สื่อสารผ่าน stdin/stdout — เหมาะกับ Claude Desktop, local scripts

**Role:** กำหนดจาก `MCP_ACCESS_MODE` ใน env — ไม่รองรับ header

```bash
# รัน dev
TRANSPORT=stdio MCP_ACCESS_MODE=sales npm run dev

# รัน production
TRANSPORT=stdio MCP_ACCESS_MODE=admin node dist/index.js
```

Agent ส่ง/รับ MCP message ผ่าน stdin/stdout ตาม [MCP spec](https://spec.modelcontextprotocol.io):

```json
// ส่งไปทาง stdin
{"jsonrpc":"2.0","id":1,"method":"tools/list"}

// รับกลับทาง stdout
{"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
```

> stdio mode ยังคง start HTTP server (port 3002) ด้วย สำหรับ `/health`, `/tools`, `/call`

---

### Mode 2: HTTP/SSE (legacy)

เชื่อมต่อแบบ 2 ขั้นตอน: เปิด SSE stream → ได้ sessionId → ส่ง message ผ่าน POST

```bash
TRANSPORT=sse PORT=3002 MCP_ACCESS_MODE=sales node dist/index.js
```

#### ขั้นตอนที่ 1 — เปิด SSE connection

```bash
curl -N http://SERVER:3002/sse \
  -H "mcp-access-mode: sales"
```

Response (event stream):
```
event: endpoint
data: /message?sessionId=abc123def456
```

#### ขั้นตอนที่ 2 — ส่ง MCP message

```bash
# list tools
curl -X POST "http://SERVER:3002/message?sessionId=abc123def456" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# call tool
curl -X POST "http://SERVER:3002/message?sessionId=abc123def456" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_product",
      "arguments": { "keyword": "น้ำตาล" }
    }
  }'
```

Response จะส่งกลับมาผ่าน SSE stream ที่เปิดไว้ในขั้นตอนที่ 1

---

### Mode 3: Streamable HTTP

Endpoint เดียว (`/mcp`) รองรับทั้ง request/response และ streaming — เหมาะกับ n8n, Dify, Cursor, Windsurf

```bash
TRANSPORT=streamable-http PORT=3002 node dist/index.js
# หรือ TRANSPORT=sse ก็รองรับ /mcp เช่นกัน
```

#### List tools

```bash
curl -X POST http://SERVER:3002/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### Call tool

```bash
curl -X POST http://SERVER:3002/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_stock_balance",
      "arguments": { "product_code": "P001" }
    }
  }'
```

#### Initialize session (ถ้า client ต้องการ)

```bash
curl -X POST http://SERVER:3002/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: admin" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"my-agent","version":"1.0"}}}'
```

---

### Mode 4: Direct REST `/call`

เรียก tool โดยตรงโดยไม่ต้องใช้ MCP protocol — เหมาะกับ n8n HTTP Request node, webhook, หรือ script ที่ไม่ต้องการ MCP client

```bash
curl -X POST http://SERVER:3002/call \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "name": "search_product",
    "arguments": {
      "keyword": "น้ำตาล"
    }
  }'
```

Response (ตอบกลับ JSON ตรงๆ ไม่มี JSON-RPC wrapper):
```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"item_code\":\"A001\",\"name\":\"น้ำตาลทราย\",\"unit\":\"ถุง\"}]"
    }
  ]
}
```

#### ตรวจสอบ tools ที่ใช้ได้ตาม role

```bash
curl http://SERVER:3002/tools \
  -H "mcp-access-mode: purchase"
```

---

## Agent Flow: ใบสั่งจอง (Sale Reservation)

ใบสั่งจองใช้ **2 endpoint แยกกัน** — อ่านข้อมูลก่อน แล้วค่อยสร้างเอกสาร

```
ขั้นตอนที่ 1: ค้นหาข้อมูล  →  /mcp หรือ /call หรือ /sse
ขั้นตอนที่ 2: สร้างใบจอง  →  /api/sale_reserve (เฉพาะ admin, sales)
```

### Flow ทั้งหมด

```
1. รับชื่อ + เบอร์โทรลูกค้า
2. search_product       → หา item_code จากชื่อสินค้า
3. get_stock_balance    → เช็คสต็อกคงเหลือ
4. get_product_price    → ดูราคาและ unit_code
5. สรุปรายการ + ขอยืนยัน
6. create_sale_reserve  → ได้ doc_no กลับมา
```

---

### วิธีที่ 1: ผ่าน Streamable HTTP `/mcp` + `/api/sale_reserve`

เหมาะกับ: n8n MCP node, Dify, Cursor, Windsurf

**Step 1.1 — ค้นหาสินค้า**

```bash
curl -X POST http://SERVER:3002/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_product",
      "arguments": { "keyword": "น้ำตาล" }
    }
  }'
```

**Step 1.2 — เช็คสต็อก**

```bash
curl -X POST http://SERVER:3002/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_stock_balance",
      "arguments": { "product_code": "A001" }
    }
  }'
```

**Step 1.3 — ดูราคา**

```bash
curl -X POST http://SERVER:3002/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_product_price",
      "arguments": { "product_code": "A001" }
    }
  }'
```

**Step 2 — สร้างใบจอง (endpoint แยก)**

```bash
curl -X POST http://SERVER:3002/api/sale_reserve \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "create_sale_reserve",
      "arguments": {
        "contact_name": "คุณสมชาย",
        "contact_phone": "0812345678",
        "contact_address": "กรุงเทพฯ",
        "contact_email": "somchai@example.com",
        "doc_date": "2026-03-31",
        "sale_code": "S001",
        "items": [
          {
            "item_code": "A001",
            "qty": 2,
            "unit_code": "ถุง",
            "price": 350,
            "discount_amount": 0,
            "warehouse": "WH01"
          }
        ]
      }
    }
  }'
```

Response เมื่อสำเร็จ:
```json
{
  "content": [{
    "type": "text",
    "text": "{\"success\":true,\"doc_no\":\"RV20260331143022-A3F9\",\"message\":\"สร้างใบจองขายสำเร็จ\"}"
  }]
}
```

---

### วิธีที่ 2: ผ่าน Direct REST `/call` + `/api/sale_reserve`

เหมาะกับ: n8n HTTP Request node, webhook, script

**Step 1 — ค้นหาข้อมูล (ใช้ /call)**

```bash
# ค้นสินค้า
curl -X POST http://SERVER:3002/call \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{"name":"search_product","arguments":{"keyword":"น้ำตาล"}}'

# เช็คสต็อก
curl -X POST http://SERVER:3002/call \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{"name":"get_stock_balance","arguments":{"product_code":"A001"}}'

# ดูราคา
curl -X POST http://SERVER:3002/call \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{"name":"get_product_price","arguments":{"product_code":"A001"}}'
```

**Step 2 — สร้างใบจอง (ใช้ /api/sale_reserve ด้วย MCP format)**

> `/api/sale_reserve` รองรับเฉพาะ MCP protocol (JSON-RPC) ไม่รองรับ REST format ของ `/call`

```bash
curl -X POST http://SERVER:3002/api/sale_reserve \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_sale_reserve",
      "arguments": {
        "contact_name": "คุณสมชาย",
        "contact_phone": "0812345678",
        "items": [
          { "item_code": "A001", "qty": 2, "unit_code": "ถุง", "price": 350 }
        ]
      }
    }
  }'
```

---

### วิธีที่ 3: ผ่าน SSE `/sse` + `/api/sale_reserve`

เหมาะกับ: client ที่ใช้ SSE legacy transport

**Step 1 — เปิด SSE connection เพื่ออ่านข้อมูล**

```bash
# Terminal 1: เปิด stream ค้างไว้
curl -N http://SERVER:3002/sse -H "mcp-access-mode: sales"
# → ได้ sessionId: abc123
```

**Step 2 — ส่ง tool calls ผ่าน sessionId**

```bash
# Terminal 2: ส่ง message
curl -X POST "http://SERVER:3002/message?sessionId=abc123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_product","arguments":{"keyword":"น้ำตาล"}}}'
```

Response จะปรากฏใน Terminal 1 (SSE stream)

**Step 3 — สร้างใบจอง (แยก endpoint)**

```bash
curl -X POST http://SERVER:3002/api/sale_reserve \
  -H "Content-Type: application/json" \
  -H "mcp-access-mode: sales" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "create_sale_reserve",
      "arguments": {
        "contact_name": "คุณสมชาย",
        "contact_phone": "0812345678",
        "items": [{ "item_code": "A001", "qty": 2, "unit_code": "ถุง", "price": 350 }]
      }
    }
  }'
```

> `/api/sale_reserve` เป็น stateless — ไม่ต้องใช้ sessionId เดิม

---

### วิธีที่ 4: stdio (Claude Desktop)

Claude Desktop ใช้ stdio transport — tools ทุกตัวรวมถึง `create_sale_reserve` ถูกเรียกผ่าน MCP protocol โดยอัตโนมัติ

> **ข้อจำกัด:** stdio ไม่รองรับ `/api/sale_reserve` endpoint โดยตรง — Claude Desktop จะเรียก `create_sale_reserve` ผ่าน stdio MCP protocol แทน (ต้องตั้ง `MCP_ACCESS_MODE=sales` หรือ `admin` ใน env)

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "smlmcp": {
      "command": "node",
      "args": ["/path/to/smlmcpconnect/dist/index.js"],
      "env": {
        "MCP_ACCESS_MODE": "sales",
        "DB_HOST": "your_db_host",
        "DB_NAME": "your_db",
        "DB_USER": "postgres",
        "DB_PASSWORD": "your_password"
      }
    }
  }
}
```

---

### Parameters ของ `create_sale_reserve`

| Field | Type | Required | คำอธิบาย |
|---|---|:---:|---|
| `contact_name` | string | ✅ | ชื่อผู้ติดต่อ |
| `contact_phone` | string | ✅ | เบอร์โทรศัพท์ |
| `items` | array | ✅ | รายการสินค้า |
| `items[].item_code` | string | ✅ | รหัสสินค้า |
| `items[].qty` | number | ✅ | จำนวน |
| `items[].unit_code` | string | ✅ | รหัสหน่วยนับ (เช่น TR, PCS, KG) |
| `items[].price` | number | - | ราคาต่อหน่วย |
| `items[].discount_amount` | number | - | ส่วนลดต่อรายการ |
| `items[].warehouse` | string | - | รหัสคลังสินค้า |
| `contact_address` | string | - | ที่อยู่ |
| `contact_email` | string | - | อีเมล |
| `doc_date` | string | - | วันที่เอกสาร YYYY-MM-DD (default: วันนี้) |
| `sale_code` | string | - | รหัสพนักงานขาย |
| `total_except_vat` | number | - | ยอดที่ยกเว้นภาษี |

### Error Cases

| HTTP Status | สาเหตุ |
|---|---|
| `403` | Role ไม่ใช่ `admin` หรือ `sales` |
| `400` | ขาด `contact_name`, `contact_phone`, หรือ `items` |
| `500` | SML Account API error |

---

## Claude Desktop Config

ไฟล์ config:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Option A: stdio (รันบนเครื่องเดียวกัน)

```json
{
  "mcpServers": {
    "smlmcp": {
      "command": "node",
      "args": ["C:\\service\\smlmcpconnect\\dist\\index.js"],
      "env": {
        "DB_HOST": "your_db_host",
        "DB_PORT": "5432",
        "DB_NAME": "your_db_name",
        "DB_USER": "postgres",
        "DB_PASSWORD": "your_password",
        "MCP_ACCESS_MODE": "admin"
      }
    }
  }
}
```

### Option B: SSE ผ่าน mcp-remote

```json
{
  "mcpServers": {
    "smlmcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://your_server_ip:3002/sse"]
    }
  }
}
```

### Option C: Streamable HTTP ผ่าน mcp-remote

```json
{
  "mcpServers": {
    "smlmcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://your_server_ip:3002/mcp"]
    }
  }
}
```

### เปรียบเทียบ Options

| | Option A (stdio) | Option B (SSE) | Option C (Streamable HTTP) |
|---|---|---|---|
| Server ต้องรันแยก | ไม่ต้อง | ต้องการ | ต้องการ |
| DB config อยู่ที่ | claude_desktop_config.json | server .env | server .env |
| รองรับ multi-client | ไม่รองรับ | รองรับ | รองรับ |
| เหมาะกับ | dev, ใช้คนเดียว | Docker, production | Docker, production (modern) |

---

## การตั้งค่า Config

### 1. Environment Variables (แนะนำ)

```bash
TRANSPORT=sse
PORT=3002
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=postgres
DB_PASSWORD=your_password
MCP_TOOLS=*
MCP_ACCESS_MODE=admin
```

### 2. config.json

```json
{
  "database": {
    "host": "your_db_host",
    "port": 5432,
    "name": "your_db_name",
    "user": "postgres",
    "password": "your_password",
    "ssl": false
  },
  "mcp": {
    "port": 3002,
    "tools": ["*"]
  },
  "smlapi": {
    "url": "http://sml-account-server:port",
    "guid": "your-guid",
    "configFileName": "your-config",
    "databaseName": "your-db",
    "doc_format_code": "RV",
    "cust_code": "WALKIN",
    "vat_type": 0,
    "vat_rate": 7,
    "sale_type": 1
  }
}
```

### 3. Remote Config URL

```bash
CONFIG_URL=http://config-service:3001/api/config
```

Config จะถูก reload อัตโนมัติทุก 30 วินาที

### Hot Reload

```bash
curl -X POST http://SERVER:3002/reload
```

---

## Docker

```bash
# รัน ด้วย Docker Compose
docker-compose up -d

# Health check
curl http://SERVER:3002/health
```

```json
{
  "status": "ok",
  "configSource": "env",
  "tools": ["search_product", "get_stock_balance", "..."],
  "transport": "sse",
  "connections": 2
}
```

---

## n8n / Dify / Cursor

ใช้ **Streamable HTTP** endpoint สำหรับอ่านข้อมูล:
```
http://SERVER:3002/mcp
```

ใช้ **Write endpoint** สำหรับสร้างใบสั่งจอง:
```
http://SERVER:3002/api/sale_reserve
```

---

## License

SML Software — Internal Use
