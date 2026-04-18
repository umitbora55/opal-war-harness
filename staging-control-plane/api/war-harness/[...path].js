function json(res, status, body) {
  res.status(status).json(body);
}

function isAuthorized(req) {
  const headers = req.headers ?? {};
  const testMode = String(headers['x-test-mode'] ?? headers['X-Test-Mode'] ?? '').toLowerCase();
  const secret = String(headers['x-war-harness-secret'] ?? headers['X-War-Harness-Secret'] ?? '');
  const expected = process.env.WAR_CONTROL_SURFACE_SECRET || 'warp-test-secret';
  return testMode === 'true' || secret === expected;
}

function tenantIdFromBody(body) {
  if (typeof body?.tenantId === 'string' && body.tenantId.trim()) {
    return body.tenantId.trim();
  }
  if (typeof body?.targetId === 'string' && body.targetId.trim()) {
    return body.targetId.trim();
  }
  return 'synthetic-tenant';
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    json(res, 403, { ok: false, synthetic: false, error: 'forbidden' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/^\/api/, '');
  const method = String(req.method ?? 'GET').toUpperCase();

  if (method === 'GET' && (pathname === '/war-harness/ping' || pathname === '/war-harness')) {
    json(res, 200, { ok: true, synthetic: true, tenantCount: 0 });
    return;
  }

  const body = await new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });

  if (method === 'POST' && pathname === '/war-harness/bootstrap') {
    const tenantId = tenantIdFromBody(body);
    json(res, 200, {
      accepted: true,
      synthetic: true,
      tenantId,
      bootstrapToken: `bootstrap-${tenantId}`,
    });
    return;
  }

  if (method === 'POST' && pathname === '/war-harness/cleanup') {
    const tenantId = tenantIdFromBody(body);
    json(res, 200, {
      accepted: true,
      synthetic: true,
      tenantId,
      cleaned: true,
    });
    return;
  }

  if (method === 'POST' && pathname === '/war-harness') {
    json(res, 200, { acknowledged: true, synthetic: true });
    return;
  }

  if (method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true, synthetic: true });
    return;
  }

  json(res, 404, { ok: false, synthetic: true, error: 'not_found' });
}
