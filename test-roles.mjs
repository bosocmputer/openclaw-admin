/**
 * Test script: Role-Based Tool Visibility
 * ทดสอบ ListTools ทั้ง 3 transport modes x 5 roles
 */
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROLES = ['admin', 'sales', 'purchase', 'stock', 'general'];
const HTTP_PORT = 13579; // Use unusual port to avoid conflict

// Expected tools per role based on PERMISSION_MATRIX + ADMIN_ONLY_TOOLS
const EXPECTED = {
  admin: {
    includes: ['search_product', 'search_customer', 'search_supplier', 'get_stock_balance',
      'get_product_price', 'get_account_incoming', 'get_account_outstanding', 'get_bookout_balance',
      'fallback_response', 'get_sales_summary', 'get_customer_rfm'],
    excludes: [],
  },
  sales: {
    includes: ['search_product', 'search_customer', 'get_stock_balance', 'get_product_price',
      'get_account_outstanding', 'get_bookout_balance', 'fallback_response'],
    excludes: ['search_supplier', 'get_account_incoming', 'get_sales_summary', 'get_customer_rfm'],
  },
  purchase: {
    includes: ['search_product', 'search_supplier', 'get_stock_balance', 'get_account_incoming', 'fallback_response'],
    excludes: ['search_customer', 'get_product_price', 'get_account_outstanding', 'get_bookout_balance',
      'get_sales_summary', 'get_customer_rfm'],
  },
  stock: {
    includes: ['search_product', 'get_stock_balance', 'get_account_incoming', 'get_account_outstanding',
      'get_bookout_balance', 'fallback_response'],
    excludes: ['search_customer', 'search_supplier', 'get_product_price', 'get_sales_summary', 'get_customer_rfm'],
  },
  general: {
    includes: ['search_product', 'get_stock_balance', 'get_product_price', 'fallback_response'],
    excludes: ['search_customer', 'search_supplier', 'get_account_incoming', 'get_account_outstanding',
      'get_bookout_balance', 'get_sales_summary', 'get_customer_rfm'],
  },
};

// ─── Utility functions ─────────────────────────────────────────────

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateTools(role, toolNames, mode) {
  const expected = EXPECTED[role];
  const errors = [];

  for (const name of expected.includes) {
    if (!toolNames.includes(name)) {
      errors.push(`  MISSING: ${name} (should be visible for ${role})`);
    }
  }
  for (const name of expected.excludes) {
    if (toolNames.includes(name)) {
      errors.push(`  UNEXPECTED: ${name} (should NOT be visible for ${role})`);
    }
  }

  if (errors.length === 0) {
    console.log(`  ✅ [${mode}] role=${role}: ${toolNames.length} tools — PASS`);
  } else {
    console.log(`  ❌ [${mode}] role=${role}: ${toolNames.length} tools — FAIL`);
    errors.forEach(e => console.log(e));
  }
  return errors.length === 0;
}

// ─── Test 1: Streamable HTTP (/mcp) ─────────────────────────────────

async function testStreamableHTTP(role) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  });

  const ACCEPT_HEADER = 'application/json, text/event-stream';

  // Initialize first
  await httpRequest({
    hostname: 'localhost', port: HTTP_PORT, path: '/mcp', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': ACCEPT_HEADER, 'mcp-access-mode': role },
  }, body);

  // List tools
  const listBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const res = await httpRequest({
    hostname: 'localhost', port: HTTP_PORT, path: '/mcp', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': ACCEPT_HEADER, 'mcp-access-mode': role },
  }, listBody);

  try {
    // Response is SSE format: "event: message\ndata: {...}\n\n"
    const dataMatch = res.data.match(/^data:\s*(.+)$/m);
    if (!dataMatch) {
      console.log(`  ❌ [Streamable HTTP] role=${role}: No data in SSE response`);
      console.log(`     Response: ${res.data.substring(0, 300)}`);
      return false;
    }
    const parsed = JSON.parse(dataMatch[1]);
    const toolNames = (parsed.result?.tools || []).map(t => t.name);
    return validateTools(role, toolNames, 'Streamable HTTP');
  } catch (e) {
    console.log(`  ❌ [Streamable HTTP] role=${role}: Parse error — ${e.message}`);
    console.log(`     Response: ${res.data.substring(0, 300)}`);
    return false;
  }
}

// ─── Test 2: SSE (/sse + /message) ──────────────────────────────────

async function testSSE(role) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`  ⚠️  [SSE] role=${role}: Timeout (5s)`);
      resolve(false);
    }, 5000);

    const req = http.get({
      hostname: 'localhost', port: HTTP_PORT, path: '/sse',
      headers: { 'mcp-access-mode': role },
    }, (res) => {
      let sseData = '';
      let sessionId = null;

      res.on('data', async (chunk) => {
        sseData += chunk.toString();

        // Look for endpoint event with sessionId
        const endpointMatch = sseData.match(/event:\s*endpoint\ndata:\s*(.+)\n/);
        if (endpointMatch && !sessionId) {
          const endpoint = endpointMatch[1].trim();
          const match = endpoint.match(/sessionId=([^&\s]+)/);
          if (match) {
            sessionId = match[1];

            // Send initialize
            const initBody = JSON.stringify({
              jsonrpc: '2.0', id: 1, method: 'initialize',
              params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'test-sse', version: '1.0.0' },
              },
            });

            await httpRequest({
              hostname: 'localhost', port: HTTP_PORT,
              path: `/message?sessionId=${sessionId}`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }, initBody);

            // Wait a bit then send tools/list
            await sleep(300);

            const listBody = JSON.stringify({
              jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
            });

            await httpRequest({
              hostname: 'localhost', port: HTTP_PORT,
              path: `/message?sessionId=${sessionId}`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }, listBody);
          }
        }

        // Look for tools/list response in SSE stream
        const lines = sseData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.substring(6));
              if (json.id === 2 && json.result?.tools) {
                clearTimeout(timeout);
                const toolNames = json.result.tools.map(t => t.name);
                const pass = validateTools(role, toolNames, 'SSE');
                res.destroy();
                resolve(pass);
                return;
              }
            } catch { /* not json or not our response */ }
          }
        }
      });
    });

    req.on('error', (e) => {
      clearTimeout(timeout);
      console.log(`  ❌ [SSE] role=${role}: Connection error — ${e.message}`);
      resolve(false);
    });
  });
}

// ─── Test 3: Stdio ─────────────────────────────────────────────────

async function testStdio(role) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`  ⚠️  [stdio] role=${role}: Timeout (10s)`);
      child.kill();
      resolve(false);
    }, 10000);

    const env = { ...process.env, MCP_ACCESS_MODE: role, TRANSPORT: 'stdio', PORT: String(HTTP_PORT + 100 + ROLES.indexOf(role)) };
    const child = spawn('node', [join(__dirname, 'dist/index.js')], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let initialized = false;

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      // Wait for server to be ready
      if (!initialized && stderr.includes('MCP Server running on stdio')) {
        initialized = true;
        // Send initialize
        const initReq = JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-stdio', version: '1.0.0' },
          },
        });
        child.stdin.write(initReq + '\n');

        // Send initialized notification
        setTimeout(() => {
          const notif = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
          child.stdin.write(notif + '\n');

          // Send tools/list
          setTimeout(() => {
            const listReq = JSON.stringify({
              jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
            });
            child.stdin.write(listReq + '\n');
          }, 300);
        }, 300);
      }
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Look for tools/list response
      const lines = stdout.split('\n');
      for (const line of lines) {
        try {
          const json = JSON.parse(line.trim());
          if (json.id === 2 && json.result?.tools) {
            clearTimeout(timeout);
            const toolNames = json.result.tools.map(t => t.name);
            const pass = validateTools(role, toolNames, 'stdio');
            child.kill();
            resolve(pass);
            return;
          }
        } catch { /* not json yet */ }
      }
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      console.log(`  ❌ [stdio] role=${role}: Process error — ${e.message}`);
      resolve(false);
    });
  });
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  let totalPass = 0;
  let totalFail = 0;

  // ── Test Streamable HTTP ──
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Test 1: Streamable HTTP (/mcp)');
  console.log('══════════════════════════════════════════════════');

  // Start HTTP server
  const env = { ...process.env, TRANSPORT: 'sse', PORT: String(HTTP_PORT) };
  const httpProc = spawn('node', [join(__dirname, 'dist/index.js')], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  let httpReady = false;
  httpProc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!httpReady) process.stderr.write(msg);
    if (msg.includes('HTTP server running')) httpReady = true;
  });

  // Wait for server to start
  for (let i = 0; i < 50 && !httpReady; i++) await sleep(200);
  if (!httpReady) {
    console.log('  ❌ HTTP server failed to start');
    httpProc.kill();
    process.exit(1);
  }

  console.log('');
  for (const role of ROLES) {
    const pass = await testStreamableHTTP(role);
    pass ? totalPass++ : totalFail++;
  }

  // ── Test SSE ──
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Test 2: SSE (/sse + /message)');
  console.log('══════════════════════════════════════════════════\n');

  for (const role of ROLES) {
    const pass = await testSSE(role);
    pass ? totalPass++ : totalFail++;
  }

  // Kill HTTP server
  httpProc.kill();
  await sleep(500);

  // ── Test Stdio ──
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Test 3: Stdio (MCP_ACCESS_MODE env)');
  console.log('══════════════════════════════════════════════════\n');

  for (const role of ROLES) {
    const pass = await testStdio(role);
    pass ? totalPass++ : totalFail++;
    await sleep(500); // Wait between spawns
  }

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${totalPass} passed, ${totalFail} failed (total: ${totalPass + totalFail})`);
  console.log('══════════════════════════════════════════════════\n');

  // Expected tool visibility table
  console.log('  Expected Tool Visibility Matrix:');
  console.log('  ┌──────────────────────────┬───────┬───────┬──────────┬───────┬─────────┐');
  console.log('  │ Tool                     │ admin │ sales │ purchase │ stock │ general │');
  console.log('  ├──────────────────────────┼───────┼───────┼──────────┼───────┼─────────┤');
  console.log('  │ search_product           │  ✅   │  ✅   │    ✅    │  ✅   │   ✅    │');
  console.log('  │ search_customer          │  ✅   │  ✅   │    ❌    │  ❌   │   ❌    │');
  console.log('  │ search_supplier          │  ✅   │  ❌   │    ✅    │  ❌   │   ❌    │');
  console.log('  │ get_stock_balance        │  ✅   │  ✅   │    ✅    │  ✅   │   ✅    │');
  console.log('  │ get_product_price        │  ✅   │  ✅   │    ❌    │  ❌   │   ✅    │');
  console.log('  │ get_account_incoming     │  ✅   │  ❌   │    ✅    │  ✅   │   ❌    │');
  console.log('  │ get_account_outstanding  │  ✅   │  ✅   │    ❌    │  ✅   │   ❌    │');
  console.log('  │ get_bookout_balance      │  ✅   │  ✅   │    ❌    │  ✅   │   ❌    │');
  console.log('  │ fallback_response        │  ✅   │  ✅   │    ✅    │  ✅   │   ✅    │');
  console.log('  │ sales/* (10 tools)       │  ✅   │  ❌   │    ❌    │  ❌   │   ❌    │');
  console.log('  │ crm/* (2 tools)          │  ✅   │  ❌   │    ❌    │  ❌   │   ❌    │');
  console.log('  └──────────────────────────┴───────┴───────┴──────────┴───────┴─────────┘');

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
