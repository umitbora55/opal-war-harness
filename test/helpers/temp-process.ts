import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

export async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

export async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export interface SpawnedProcess {
  proc: ChildProcessWithoutNullStreams;
  stop(): Promise<void>;
}

export function spawnNodeScript(args: string[], env: NodeJS.ProcessEnv): SpawnedProcess {
  const proc = spawn(process.execPath, ['--import', 'tsx', ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    proc,
    async stop() {
      if (proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      const exited = Promise.race([
        once(proc, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
      await exited;
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
        await once(proc, 'exit');
      }
    },
  };
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
