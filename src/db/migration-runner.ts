import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';

export interface MigrationRecord {
  name: string;
  appliedAt: string;
}

export async function ensureMigrationTable(pool: Pool, tableName = 'war_harness_migrations'): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function listAppliedMigrations(pool: Pool, tableName = 'war_harness_migrations'): Promise<MigrationRecord[]> {
  await ensureMigrationTable(pool, tableName);
  const result = await pool.query<{ name: string; applied_at: Date }>(
    `SELECT name, applied_at FROM ${tableName} ORDER BY id ASC`,
  );
  return result.rows.map((row) => ({ name: row.name, appliedAt: row.applied_at.toISOString() }));
}

export async function runMigrations(pool: Pool, migrationsDir: string, tableName = 'war_harness_migrations'): Promise<MigrationRecord[]> {
  await ensureMigrationTable(pool, tableName);
  const applied = await listAppliedMigrations(pool, tableName);
  const appliedNames = new Set(applied.map((migration) => migration.name));
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const next: MigrationRecord[] = [...applied];

  for (const file of files) {
    if (appliedNames.has(file)) {
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO ${tableName} (name) VALUES ($1)`, [file]);
      await pool.query('COMMIT');
      next.push({ name: file, appliedAt: new Date().toISOString() });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  return next;
}
