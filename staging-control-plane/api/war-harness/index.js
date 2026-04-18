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

async function readBody(req) {
  return new Promise((resolve) => {
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
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    json(res, 403, { ok: false, synthetic: false, error: 'forbidden' });
    return;
  }

  const method = String(req.method ?? 'GET').toUpperCase();

  if (method === 'GET') {
    json(res, 200, {
      ok: true,
      synthetic: true,
      acknowledged: true,
      surface: 'flutter-bridge',
    });
    return;
  }

  if (method === 'POST') {
    const body = await readBody(req);
    const tenantId = tenantIdFromBody(body);
    json(res, 200, {
      acknowledged: true,
      synthetic: true,
      tenantId,
      screen: body?.screen ?? 'war-harness-preflight',
      action: body?.action ?? 'ping',
    });
    return;
  }

  json(res, 405, { ok: false, synthetic: true, error: 'method_not_allowed' });
}
