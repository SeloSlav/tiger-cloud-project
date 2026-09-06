import { readFile } from 'node:fs/promises';
import { connect } from './database';
import { makeReadings, ZONES, START } from '../lib/telemetry';

const client = await connect();
try {
  await client.query(
    await readFile(new URL('../db/001_schema.sql', import.meta.url), 'utf8'),
  );
  await client.query('BEGIN');
  for (const zone of ZONES)
    await client.query(
      'INSERT INTO frostline.zones(id,name,cargo) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, cargo=EXCLUDED.cargo',
      [zone.id, zone.name, zone.cargo],
    );
  const rows = makeReadings();
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500),
      values: unknown[] = [];
    const placeholders = batch.map((r, i) => {
      values.push(r.time, r.zone, r.sensor, r.temperature);
      const n = i * 4;
      return `($${n + 1},$${n + 2},$${n + 3},$${n + 4})`;
    });
    await client.query(
      `INSERT INTO frostline.readings(time,zone_id,sensor_id,temperature_c) VALUES ${placeholders.join(',')} ON CONFLICT(time,sensor_id) DO NOTHING`,
      values,
    );
  }
  await client.query('COMMIT');
  const end = new Date(Date.parse(START) + 86400000).toISOString();
  await client.query(
    "CALL refresh_continuous_aggregate('frostline.zone_5m', $1::timestamptz, $2::timestamptz)",
    [START, end],
  );
  const { rows: result } = await client.query(
    'SELECT count(*)::integer AS readings FROM frostline.readings',
  );
  console.log(
    `Seed complete: ${result[0].readings} readings. Hypertable and continuous aggregate ready.`,
  );
} finally {
  await client.end();
}
