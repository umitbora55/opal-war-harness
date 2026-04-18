import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Client } from 'pg';
import { findFreePort } from './temp-process.js';

export interface TempPostgres {
  url: string;
  dataDir: string;
  port: number;
  async stop(): Promise<void>;
}

export async function startTempPostgres(): Promise<TempPostgres> {
  const dataDir = await mkdtemp(join(tmpdir(), 'opal-war-pg-'));
  const port = await findFreePort();
  const initdb = spawn('initdb', ['--auth-local=trust', '--auth-host=trust', '--no-instructions', '-D', dataDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const initExit = await once(initdb, 'exit');
  if (initExit[0] !== 0) {
    throw new Error(`initdb failed: ${initExit[0]}`);
  }

  const logFile = join(dataDir, 'postgres.log');
  const start = spawn('pg_ctl', ['-D', dataDir, '-l', logFile, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const startExit = await once(start, 'exit');
  if (startExit[0] !== 0) {
    throw new Error(`pg_ctl start failed: ${startExit[0]}`);
  }

  const user = process.env.USER || process.env.LOGNAME || 'postgres';
  const url = `postgresql://${encodeURIComponent(user)}@127.0.0.1:${port}/postgres`;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('SELECT 1');
  await client.end();

  return {
    url,
    dataDir,
    port,
    async stop() {
      const stop = spawn('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stopExit = await once(stop, 'exit');
      if (stopExit[0] !== 0) {
        throw new Error(`pg_ctl stop failed: ${stopExit[0]}`);
      }
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
