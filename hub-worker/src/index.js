/**
 * Claude Terminal — Workflow Hub Worker
 *
 * Routes:
 *   GET  /workflows?tab=featured|browse&q=&page=  → list workflows
 *   GET  /workflows/:id                            → get single workflow
 *   POST /workflows                                → submit new workflow
 *   POST /workflows/:id/import                     → increment import counter
 *   PUT  /workflows/:id                            → admin: update/verify (requires X-Admin-Secret)
 *   DELETE /workflows/:id                          → admin: delete (requires X-Admin-Secret)
 *
 * KV keys:
 *   wf:{id}          → workflow JSON object
 *   index:all        → cached array of all workflow summaries (rebuilt on write)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
};

const PAGE_SIZE = 20;

// ─── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    try {
      // GET /workflows
      if (method === 'GET' && path === '/workflows') {
        return await listWorkflows(request, env);
      }
      // GET /workflows/:id
      const singleMatch = path.match(/^\/workflows\/([^/]+)$/);
      if (method === 'GET' && singleMatch) {
        return await getWorkflow(singleMatch[1], env);
      }
      // POST /workflows
      if (method === 'POST' && path === '/workflows') {
        return await submitWorkflow(request, env);
      }
      // POST /workflows/:id/import
      const importMatch = path.match(/^\/workflows\/([^/]+)\/import$/);
      if (method === 'POST' && importMatch) {
        return await incrementImport(importMatch[1], env);
      }
      // PUT /workflows/:id  (admin)
      if (method === 'PUT' && singleMatch) {
        return await adminUpdate(request, singleMatch[1], env);
      }
      // DELETE /workflows/:id  (admin)
      if (method === 'DELETE' && singleMatch) {
        return await adminDelete(request, singleMatch[1], env);
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

// ─── Handlers ────────────────────────────────────────────────────────────────

async function listWorkflows(request, env) {
  const url = new URL(request.url);
  const tab   = url.searchParams.get('tab') || 'featured';
  const query = (url.searchParams.get('q') || '').toLowerCase().trim();
  const page  = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));

  // Load index (cached array of summaries)
  let all = await getIndex(env);

  // Filter by tab
  if (tab === 'featured') {
    all = all.filter(w => w.verified);
  }

  // Filter by search query
  if (query) {
    all = all.filter(w =>
      w.name.toLowerCase().includes(query) ||
      (w.description || '').toLowerCase().includes(query) ||
      (w.tags || []).some(t => t.toLowerCase().includes(query))
    );
  }

  // Sort: verified first, then by imports desc
  all.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return (b.imports || 0) - (a.imports || 0);
  });

  // Paginate
  const total = all.length;
  const items = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return json({ items, total, page, pageSize: PAGE_SIZE });
}

async function getWorkflow(id, env) {
  const wf = await env.WORKFLOWS_HUB.get(`wf:${id}`, 'json');
  if (!wf) return json({ error: 'Not found' }, 404);
  return json(wf);
}

async function submitWorkflow(request, env) {
  // Rate limit: max 5 submissions per IP per hour (stored in KV with TTL)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `rl:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const count = parseInt(await env.WORKFLOWS_HUB.get(rateLimitKey) || '0', 10);
  if (count >= 5) {
    return json({ error: 'Rate limit exceeded. Max 5 submissions per hour.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Validate required fields
  const name = (body.name || '').trim();
  const description = (body.description || '').trim();
  const author = (body.author || 'anonyme').trim().slice(0, 50);
  const tags = (body.tags || []).slice(0, 5).map(t => String(t).trim().toLowerCase()).filter(Boolean);
  const workflowJson = body.workflowJson || null;

  if (!name || name.length > 80) {
    return json({ error: 'Name is required (max 80 chars)' }, 400);
  }
  if (!description || description.length > 500) {
    return json({ error: 'Description is required (max 500 chars)' }, 400);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workflow = {
    id,
    name,
    description,
    author,
    tags,
    workflowJson,
    verified: false,
    imports: 0,
    createdAt: new Date().toISOString(),
  };

  await env.WORKFLOWS_HUB.put(`wf:${id}`, JSON.stringify(workflow));

  // Increment rate limit counter (TTL: 2h to cover the hour boundary)
  await env.WORKFLOWS_HUB.put(rateLimitKey, String(count + 1), { expirationTtl: 7200 });

  // Invalidate index cache
  await env.WORKFLOWS_HUB.delete('index:all');

  return json({ success: true, id }, 201);
}

async function incrementImport(id, env) {
  const wf = await env.WORKFLOWS_HUB.get(`wf:${id}`, 'json');
  if (!wf) return json({ error: 'Not found' }, 404);
  wf.imports = (wf.imports || 0) + 1;
  await env.WORKFLOWS_HUB.put(`wf:${id}`, JSON.stringify(wf));
  // Invalidate index cache so import count stays fresh
  await env.WORKFLOWS_HUB.delete('index:all');
  return json({ success: true, imports: wf.imports });
}

async function adminUpdate(request, id, env) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);

  const wf = await env.WORKFLOWS_HUB.get(`wf:${id}`, 'json');
  if (!wf) return json({ error: 'Not found' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const updated = { ...wf, ...body, id }; // id is immutable
  await env.WORKFLOWS_HUB.put(`wf:${id}`, JSON.stringify(updated));
  await env.WORKFLOWS_HUB.delete('index:all');
  return json({ success: true, workflow: updated });
}

async function adminDelete(request, id, env) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  await env.WORKFLOWS_HUB.delete(`wf:${id}`);
  await env.WORKFLOWS_HUB.delete('index:all');
  return json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAdmin(request, env) {
  const secret = request.headers.get('X-Admin-Secret');
  return secret && secret === env.ADMIN_SECRET;
}

async function getIndex(env) {
  // Try cache first
  const cached = await env.WORKFLOWS_HUB.get('index:all', 'json');
  if (cached) return cached;

  // Rebuild from all wf: keys
  const list = await env.WORKFLOWS_HUB.list({ prefix: 'wf:' });
  const summaries = [];

  for (const key of list.keys) {
    const wf = await env.WORKFLOWS_HUB.get(key.name, 'json');
    if (!wf) continue;
    // Only store summary fields in index (not full workflowJson)
    summaries.push({
      id:          wf.id,
      name:        wf.name,
      description: wf.description,
      author:      wf.author,
      tags:        wf.tags,
      verified:    wf.verified,
      imports:     wf.imports,
      createdAt:   wf.createdAt,
    });
  }

  // Cache for 60 seconds
  await env.WORKFLOWS_HUB.put('index:all', JSON.stringify(summaries), { expirationTtl: 60 });
  return summaries;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
