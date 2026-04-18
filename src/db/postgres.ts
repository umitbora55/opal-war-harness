import { Pool, type PoolConfig } from 'pg';

export function createPool(connectionString: string): Pool {
  const config: PoolConfig = {
    connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
  return new Pool(config);
}
