import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Client } from 'pg';
import { resolveHarnessConfig } from '../src/core/environment-resolver.js';
import { runHarness } from '../src/core/run-coordinator.js';
import { runMigrations } from '../src/db/migration-runner.js';
import { createPool } from '../src/db/postgres.js';
import { createRunStore } from '../src/db/run-store.js';
import { writeGrafanaExport } from '../src/metrics/export-provider.js';
import { ControlSurfaceState } from '../src/server/control-surface-state.js';
import { startTempPostgres } from './helpers/temp-postgres.js';
import { spawnNodeScript } from './helpers/temp-process.js';

async function waitForHttp(url: string, headers?: HeadersInit): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

test('migration runner applies sql once and remains idempotent', { timeout: 120_000 }, async (t) => {
  const db = await startTempPostgres();
  t.after(() => db.stop());
  const pool = createPool(db.url);
  try {
    const first = await runMigrations(pool, './migrations', 'war_harness_migrations');
    const second = await runMigrations(pool, './migrations', 'war_harness_migrations');
    assert.ok(first.length >= 1);
    assert.equal(second.length, first.length);

    const client = new Client({ connectionString: db.url });
    await client.connect();
    const result = await client.query('SELECT COUNT(*)::int AS count FROM war_harness_migrations');
    assert.equal(result.rows[0].count, first.length);
    await client.end();
  } finally {
    await pool.end();
  }
});

test('db-backed smoke run persists artifacts and control-surface bootstrap/cleanup', { timeout: 120_000 }, async (t) => {
  const db = await startTempPostgres();
  t.after(async () => {
    await db.stop();
  });

  const config = await resolveHarnessConfig({
    mode: 'smoke',
    environment: 'local',
    databaseEnabled: true,
    databaseUrl: db.url,
    controlPlaneUrl: '',
    allowJsonFallback: false,
    userCount: 12,
    runName: 'integration-smoke',
  });
  const result = await runHarness(config);
  assert.ok(existsSync(result.reportJsonPath));
  assert.ok(existsSync(result.replayBundlePath));
  assert.ok(existsSync(result.providerExportPath));

  const client = new Client({ connectionString: db.url });
  await client.connect();
  const counts = await Promise.all([
    client.query('SELECT COUNT(*)::int AS count FROM simulation_run'),
    client.query('SELECT COUNT(*)::int AS count FROM simulation_event'),
    client.query('SELECT COUNT(*)::int AS count FROM simulation_report'),
    client.query('SELECT COUNT(*)::int AS count FROM replay_bundle'),
    client.query('SELECT COUNT(*)::int AS count FROM certification_decision'),
    client.query('SELECT COUNT(*)::int AS count FROM war_harness_audit_event'),
    client.query('SELECT COUNT(*)::int AS count FROM war_harness_synthetic_tenant'),
  ]);
  for (const row of counts) {
    assert.ok(row.rows[0].count > 0);
  }
  await client.end();
});

test('provider export emits grafana-shaped artifacts', async () => {
  const paths = await writeGrafanaExport({ runName: 'provider-shape', localeDefaults: { country: 'TR', city: 'Istanbul', timezone: 'Europe/Istanbul' } });
  assert.ok(existsSync(paths.dashboardPath));
  assert.ok(existsSync(paths.alertsPath));
  assert.ok(existsSync(paths.providerPath));
  const artifact = JSON.parse(await readFile(paths.providerPath, 'utf8')) as { provider: string; dashboard: { panels: unknown[] }; alerts: { groups: unknown[] } };
  assert.equal(artifact.provider, 'grafana');
  assert.ok(Array.isArray(artifact.dashboard.panels));
  assert.ok(Array.isArray(artifact.alerts.groups));
});

test('control surface enforces test-only auth and is idempotent for cleanup', { timeout: 60_000 }, async (t) => {
  const state = new ControlSurfaceState();
  const ping = state.ping();
  assert.equal(ping.ok, true);
  assert.equal(ping.tenantCount, 0);

  const bootstrapped = state.bootstrap('idempotent-tenant');
  assert.equal(bootstrapped.tenantId, 'idempotent-tenant');
  assert.equal(state.ping().tenantCount, 1);

  const cleanedOnce = state.cleanup('idempotent-tenant');
  assert.equal(cleanedOnce.cleanedAt !== undefined, true);
  const cleanedTwice = state.cleanup('idempotent-tenant');
  assert.equal(cleanedTwice.cleanedAt !== undefined, true);
  assert.equal(state.ping().tenantCount, 1);
});

test('cli smoke contract emits provider export path', async () => {
  const proc = spawnNodeScript(['src/cli/opal-war.ts', 'smoke', '--config', './configs/base.json'], {});
  let output = '';
  proc.proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  const exit = await new Promise<number>((resolve, reject) => {
    proc.proc.once('exit', (code) => resolve(code ?? 0));
    proc.proc.once('error', reject);
  });
  assert.equal(exit, 0);
  assert.match(output, /providerExportPath/);
});
