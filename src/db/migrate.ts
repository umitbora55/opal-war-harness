#!/usr/bin/env node
import { resolveHarnessConfig } from '../core/environment-resolver.js';
import { createPool } from './postgres.js';
import { runMigrations } from './migration-runner.js';

async function main() {
  const config = await resolveHarnessConfig({ mode: 'smoke' });
  if (!config.database.enabled || !config.database.url) {
    console.log(JSON.stringify({ migrated: false, reason: 'database disabled or url missing' }, null, 2));
    return;
  }
  const pool = createPool(config.database.url);
  try {
    const records = await runMigrations(pool, config.database.migrationsDir, `${config.database.auditTablesPrefix}migrations`);
    console.log(JSON.stringify({ migrated: true, count: records.length, records }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
