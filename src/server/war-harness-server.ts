#!/usr/bin/env node
import { createServer } from 'node:http';
import { resolveHarnessConfig } from '../core/environment-resolver.js';
import { ControlSurfaceState } from './control-surface-state.js';

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    body: JSON.stringify(body),
  };
}

async function readBody(request: import('node:http').IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? JSON.parse(raw) : {};
}

async function main() {
  const config = await resolveHarnessConfig({ mode: 'smoke' });
  const state = new ControlSurfaceState();
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    const isTestMode = req.headers['x-test-mode'] === 'true';
    const secret = req.headers['x-war-harness-secret'];
    const authorized = isTestMode || secret === config.controlSurface.secret;

    if (!authorized) {
      const response = jsonResponse(403, { ok: false, error: 'forbidden' });
      res.writeHead(response.statusCode, { 'content-type': 'application/json' });
      res.end(response.body);
      return;
    }

    try {
      if (method === 'GET' && url === '/war-harness/ping') {
        const response = jsonResponse(200, state.ping());
        res.writeHead(response.statusCode, { 'content-type': 'application/json' });
        res.end(response.body);
        return;
      }

      if (method === 'POST' && url === '/war-harness/bootstrap') {
        const body = await readBody(req);
        const tenantId = String(body.tenantId ?? `tenant-${Date.now()}`);
        const record = state.bootstrap(tenantId);
        const response = jsonResponse(200, {
          accepted: true,
          synthetic: true,
          tenantId: record.tenantId,
          bootstrapToken: record.bootstrapToken,
        });
        res.writeHead(response.statusCode, { 'content-type': 'application/json' });
        res.end(response.body);
        return;
      }

      if (method === 'POST' && url === '/war-harness/cleanup') {
        const body = await readBody(req);
        const tenantId = String(body.tenantId ?? 'default');
        const record = state.cleanup(tenantId);
        const response = jsonResponse(200, {
          accepted: true,
          synthetic: true,
          cleaned: Boolean(record.cleanedAt),
        });
        res.writeHead(response.statusCode, { 'content-type': 'application/json' });
        res.end(response.body);
        return;
      }

      const response = jsonResponse(404, { ok: false, error: 'not_found' });
      res.writeHead(response.statusCode, { 'content-type': 'application/json' });
      res.end(response.body);
    } catch (error) {
      const response = jsonResponse(500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(response.statusCode, { 'content-type': 'application/json' });
      res.end(response.body);
    }
  });

  server.listen(config.controlSurface.port, '127.0.0.1', () => {
    console.log(
      JSON.stringify(
        {
          listening: true,
          port: config.controlSurface.port,
          mode: config.mode,
        },
        null,
        2,
      ),
    );
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
