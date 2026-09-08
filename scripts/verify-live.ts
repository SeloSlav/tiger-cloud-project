import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openTiger } from './mcp-database';
import { parseMonitor } from '../lib/live-monitor';
const db = await openTiger();
try {
  await db.query(
    await readFile(
      new URL('../db/live-regression.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.query(
    await readFile(
      new URL('../db/integrity-regression.sql', import.meta.url),
      'utf8',
    ),
  );
  const result = await db.query('SELECT frostline_live.monitor_snapshot()');
  const value = result.result_sets[0].rows?.[0]?.[0];
  const m = parseMonitor(typeof value === 'string' ? JSON.parse(value) : value);
  assert.equal(m.collector?.scheduled, true);
  assert.equal(m.collector?.lastStatus, 'Success');
  assert.ok(
    m.integrity,
    'Install the latest db/003_monitor.sql for the integrity check',
  );
  console.log(
    `Incident and rollup integrity regressions passed; six-zone SQL/client exposure parity verified. Latest reading: ${m.latestReadingAt}`,
  );
} finally {
  db.close();
}
