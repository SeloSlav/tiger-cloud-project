import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openTiger } from './mcp-database';
import { assertQuality } from './quality';
import { ZONES, START, summarize, type Snapshot } from '../lib/telemetry';
const db = await openTiger();
try {
  const replay = (
    await readFile(new URL('../db/replay.sql', import.meta.url), 'utf8')
  ).replace(/;\s*$/, '');
  const debt = (
    await readFile(new URL('../db/thermal-debt.sql', import.meta.url), 'utf8')
  ).replace(/;\s*$/, '');
  const quality = (
    await readFile(new URL('../db/quality.sql', import.meta.url), 'utf8')
  ).replace(/;\s*$/, '');
  // One SQL statement = one consistent MVCC snapshot, below the MCP row cap.
  const query = `WITH replay AS (${replay}), debt AS (${debt}), quality AS (${quality}), grouped AS (
    SELECT zone_id,jsonb_agg(jsonb_build_object('time',to_char(time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'temperature',temperature,'sensors',sensors) ORDER BY time) AS points FROM replay GROUP BY zone_id
  ) SELECT jsonb_build_object('version',1,'source','tiger','generatedAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'intervalMinutes',5,'engine',(SELECT 'TimescaleDB '||extversion FROM pg_extension WHERE extname='timescaledb'),
    'rawReadings',(SELECT count(*) FROM frostline.readings WHERE time >= $1 AND time < $2),
    'zones',(SELECT jsonb_object_agg(zone_id,points) FROM grouped),
    'sqlDebt',(SELECT jsonb_object_agg(zone_id,debt) FROM debt),
    'quality',(SELECT quality FROM quality)) AS snapshot`;
  const result = await db.query(query, [
    START,
    new Date(Date.parse(START) + 86400000).toISOString(),
  ]);
  const value = result.result_sets[0].rows?.[0]?.[0];
  const snapshot = (
    typeof value === 'string' ? JSON.parse(value) : value
  ) as Snapshot & { quality?: unknown };
  assertQuality(snapshot.quality);
  delete snapshot.quality;
  assert.equal(snapshot.source, 'tiger');
  for (const zone of ZONES) {
    assert.equal(snapshot.zones[zone.id].length, 288);
    assert.ok(
      Math.abs(
        summarize(snapshot.zones[zone.id], 287).debt -
          snapshot.sqlDebt![zone.id],
      ) < 0.011,
      `SQL/client parity failed for ${zone.id}`,
    );
  }
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../data/telemetry.json', import.meta.url),
    JSON.stringify(snapshot),
  );
  console.log(
    `Exported ${snapshot.rawReadings} readings via Tiger MCP / ${snapshot.engine}. SQL/client thermal-debt parity verified for six zones.`,
  );
} finally {
  db.close();
}
