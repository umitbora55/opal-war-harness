import { createHash } from 'node:crypto';

export function stableHash(input: unknown): string {
  const json = JSON.stringify(input, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  return createHash('sha256').update(json).digest('hex');
}

export function runIdFromSeed(seed: number, runName: string): string {
  const base = `${runName}:${seed}`;
  return `war_${createHash('sha256').update(base).digest('hex').slice(0, 16)}`;
}
