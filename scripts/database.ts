import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export function tigerBinary() {
  if (process.env.TIGER_BIN) return process.env.TIGER_BIN;
  const installed = join(
    process.env.LOCALAPPDATA ?? '',
    'Programs',
    'TigerCLI',
    'tiger.exe',
  );
  return process.platform === 'win32' && existsSync(installed)
    ? installed
    : 'tiger';
}
export async function connect() {
  if (existsSync('.env.database')) process.loadEnvFile('.env.database');
  // Never print the connection string. CLI credentials remain in the OS keyring.
  let connection = process.env.DATABASE_URL;
  if (!connection) {
    const args = ['db', 'connection-string'];
    if (process.env.TIGER_SERVICE_ID) args.push(process.env.TIGER_SERVICE_ID);
    args.push('--with-password', '--skip-update-check');
    connection = execFileSync(tigerBinary(), args, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
  const url = new URL(connection);
  // Enforce certificate verification even when the CLI emits sslmode=require.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    url.searchParams.delete(key);
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    statement_timeout: 60000,
  });
  await client.connect();
  return client;
}
