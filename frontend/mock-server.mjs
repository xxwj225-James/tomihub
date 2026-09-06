// Mock API server for frontend dev
// Run: node mock-server.mjs
import http from 'http';

const PORT = 8081;
let codes = {}; // email → {code, expires}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // ─── POST /api/v1/auth/send-code ───
  if (req.method === 'POST' && path === '/api/v1/auth/send-code') {
    const { email, purpose } = await body(req);
    if (!email) return json(res, { code: 40000, message: 'Email required' }, 400);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes[email] = { code, purpose, expires: Date.now() + 300000 };
    console.log(`[MOCK] Code sent to ${email}: ${code}`);
    return json(res, { code: 0, message: `验证码已发送 (DEV: ${code})`, data: { dev_code: code, expires_at: new Date(Date.now() + 300000).toISOString() } });
  }

  // ─── POST /api/v1/auth/register ───
  if (req.method === 'POST' && path === '/api/v1/auth/register') {
    const { email, code, password, display_name, invite_code } = await body(req);
    if (!email || !code) return json(res, { code: 40000, message: 'Missing fields' }, 400);
    const saved = codes[email];
    if (!saved || saved.code !== code || saved.expires < Date.now())
      return json(res, { code: 40002, message: '验证码错误或已过期' }, 400);
    if (!password || password.length < 8)
      return json(res, { code: 40003, message: '密码至少8位' }, 400);
    delete codes[email];

    const userId = 'u-' + Math.random().toString(36).slice(2, 8);
    const tenantId = invite_code ? 't-joined' : 't-' + Math.random().toString(36).slice(2, 8);

    return json(res, {
      code: 0, message: '注册成功',
      data: {
        user: { id: userId, email, display_name: display_name || email, avatar_url: null, email_verified: true },
        tokens: { access_token: 'mock-at-' + userId, refresh_token: 'mock-rt-' + userId, token_type: 'Bearer', expires_in: 900 },
        tenants: [{ id: tenantId, name: (display_name || email) + '的工作区', slug: 'workspace', logo_url: null, role: 'owner' }],
        current_tenant: { id: tenantId, name: (display_name || email) + '的工作区', slug: 'workspace', logo_url: null, role: 'owner' },
        require_tenant_selection: false
      }
    }, 201);
  }

  // ─── POST /api/v1/auth/login ───
  if (req.method === 'POST' && path === '/api/v1/auth/login') {
    const { email } = await body(req);
    if (!email) return json(res, { code: 40101, message: '邮箱或密码错误' }, 401);

    const userId = 'u-' + Math.random().toString(36).slice(2, 8);
    const t1 = 't-' + Math.random().toString(36).slice(2, 8);
    const t2 = 't-' + Math.random().toString(36).slice(2, 8);

    return json(res, {
      code: 0, message: '登录成功',
      data: {
        user: { id: userId, email, display_name: email.split('@')[0], avatar_url: null, email_verified: true },
        tokens: { access_token: 'mock-at-' + userId, refresh_token: 'mock-rt-' + userId, token_type: 'Bearer', expires_in: 900 },
        tenants: [
          { id: t1, name: 'XX科技研发团队', slug: 'xx-tech', logo_url: null, role: 'owner' },
          { id: t2, name: '个人学习项目', slug: 'personal', logo_url: null, role: 'admin' },
        ],
        current_tenant: null,
        require_tenant_selection: true
      }
    });
  }

  // ─── POST /api/v1/auth/select-tenant ───
  if (req.method === 'POST' && path === '/api/v1/auth/select-tenant') {
    const { tenant_id } = await body(req);
    return json(res, {
      code: 0, message: '已切换工作区',
      data: {
        tokens: { access_token: 'mock-at-switched', refresh_token: 'mock-rt-switched', token_type: 'Bearer', expires_in: 900 },
        current_tenant: { id: tenant_id, name: 'XX科技研发团队', slug: 'xx-tech', logo_url: null, role: 'owner' }
      }
    });
  }

  json(res, { code: 404, message: 'Not found' }, 404);
});

server.listen(PORT, () => console.log(`[Mock API] http://localhost:${PORT} — Auth endpoints ready`));
