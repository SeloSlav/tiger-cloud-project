import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { connect } from './database';
import { assertQuality } from './quality';
import {
  makeFixture,
  ZONES,
  START,
  INTERVAL,
  summarize,
  type Snapshot,
  type ZoneId,
} from '../lib/telemetry';

let snapshot: Snapshot;
if (process.argv.includes('--fixture')) snapshot = makeFixture();
else {
  const client = await connect();
  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    const end = new Date(Date.parse(START) + 86400000).toISOString();
    const quality = await client.query(
      await readFile(new URL('../db/quality.sql', import.meta.url), 'utf8'),
      [START, end],
    );
    assertQuality(quality.rows[0].quality);
    const { rows } = await client.query(
      await readFile(new URL('../db/replay.sql', import.meta.url), 'utf8'),
      [START, end],
    );
    const { rows: debt } = await client.query(
      await readFile(
        new URL('../db/thermal-debt.sql', import.meta.url),
        'utf8',
      ),
      [START, end],
    );
    const { rows: versions } = await client.query(
      "SELECT extversion FROM pg_extension WHERE extname='timescaledb'",
    );
    const { rows: count } = await client.query(
      'SELECT count(*)::integer AS count FROM frostline.readings WHERE time >= $1 AND time < $2',
      [START, end],
    );
    snapshot = {
      version: 1,
      source: 'tiger',
      generatedAt: new Date().toISOString(),
      intervalMinutes: INTERVAL,
      rawReadings: count[0].count,
      engine: `TimescaleDB ${versions[0].extversion}`,
      zones: {} as Snapshot['zones'],
      sqlDebt: {} as Record<ZoneId, number>,
    };
    for (const zone of ZONES) {
      snapshot.zones[zone.id] = rows
        .filter((r) => r.zone_id === zone.id)
        .map((r) => ({
          time: new Date(r.time).toISOString(),
          temperature: r.temperature,
          sensors: r.sensors,
        }));
      assert.equal(
        snapshot.zones[zone.id].length,
        288,
        'Export must preserve all five-minute slots',
      );
      const sqlValue = debt.find((r) => r.zone_id === zone.id).debt;
      snapshot.sqlDebt![zone.id] = sqlValue;
      assert.ok(
        Math.abs(summarize(snapshot.zones[zone.id], 287).debt - sqlValue) <
          0.011,
        `SQL/client thermal debt differs for ${zone.id}`,
      );
    }
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../data/telemetry.json', import.meta.url),
  JSON.stringify(snapshot),
);
console.log(
  `Exported ${snapshot.rawReadings} synthetic readings via ${snapshot.engine}. ${snapshot.source === 'tiger' ? 'SQL/client thermal debt parity verified for all six zones.' : 'Local fixture only.'}`,
);
