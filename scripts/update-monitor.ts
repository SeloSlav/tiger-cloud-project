import { readFile } from 'node:fs/promises';
import { openTiger } from './mcp-database';

const db = await openTiger();
try {
  const sql = await readFile(
    new URL('../db/003_monitor.sql', import.meta.url),
    'utf8',
  );
  await db.query(
    `BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s';\n${sql}\nCOMMIT;`,
  );
  console.log(
    'Monitoring functions updated through Tiger MCP; existing API grants preserved.',
  );
} finally {
  db.close();
}
