import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { openTiger } from './mcp-database';
import { tigerBinary } from './database';

if (existsSync('.env.live'))
  throw new Error(
    'Live credentials already exist; do not rotate automatically.',
  );
const db = await openTiger();
try {
  // Resolve the endpoint before creating the role, without requesting a password.
  const connection =
    process.env.DATABASE_URL ??
    execFileSync(
      tigerBinary(),
      [
        'db',
        'connection-string',
        process.env.TIGER_SERVICE_ID!,
        '--skip-update-check',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ).trim();
  const url = new URL(connection);
  const password = Array.from(randomBytes(32), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  // Fails if the role exists: repeat setup must not reset a deployed password.
  await db.query(`CREATE ROLE frostline_monitor LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 8;
    ALTER ROLE frostline_monitor SET default_transaction_read_only=on;
    ALTER ROLE frostline_monitor SET statement_timeout='8s';
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA frostline_live FROM PUBLIC;
    REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA frostline_live FROM PUBLIC;
    GRANT USAGE ON SCHEMA frostline_live TO frostline_monitor;
    GRANT EXECUTE ON FUNCTION frostline_live.monitor_snapshot() TO frostline_monitor;`);
  url.username = 'frostline_monitor';
  url.password = password;
  url.search = '';
  writeFileSync(
    '.env.live',
    `FROSTLINE_DATABASE_URL=${url}\nFROSTLINE_TLS_MODE=verify-full\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Restricted monitor role created. Credentials are in ignored .env.live; choose the TLS mode for your service before deployment.',
  );
} finally {
  db.close();
}
