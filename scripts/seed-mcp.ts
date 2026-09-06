import { readFile } from 'node:fs/promises';
import { openTiger } from './mcp-database';
import { ZONES, makeReadings, START } from '../lib/telemetry';
const db = await openTiger();
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
try {
  await db.query(
    await readFile(new URL('../db/001_schema.sql', import.meta.url), 'utf8'),
  );
  await db.query(
    `INSERT INTO frostline.zones(id,name,cargo) VALUES ${ZONES.map((z) => `(${literal(z.id)},${literal(z.name)},${literal(z.cargo)})`).join(',')} ON CONFLICT(id) DO NOTHING`,
  );
  const rows = makeReadings();
  // Controlled synthetic values only; schema and user input are not interpolated.
  for (let start = 0; start < rows.length; start += 1000) {
    const values = rows
      .slice(start, start + 1000)
      .map(
        (r) =>
          `(${literal(r.time)},${literal(r.zone)},${literal(r.sensor)},${r.temperature})`,
      );
    await db.query(
      `INSERT INTO frostline.readings(time,zone_id,sensor_id,temperature_c) VALUES ${values.join(',')} ON CONFLICT(time,sensor_id) DO NOTHING`,
    );
  }
  await db.query(
    "CALL refresh_continuous_aggregate('frostline.zone_5m',$1::timestamptz,$2::timestamptz)",
    [START, new Date(Date.parse(START) + 86400000).toISOString()],
  );
  const result = await db.query(
    'SELECT count(*) AS readings FROM frostline.readings',
  );
  console.log(
    `Tiger MCP database seed complete: ${String(result.result_sets[0].rows?.[0]?.[0])} readings.`,
  );
} finally {
  db.close();
}
