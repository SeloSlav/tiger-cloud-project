import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openTiger } from './mcp-database';
import { assertQuality } from './quality';
import { START } from '../lib/telemetry';

const db = await openTiger();
const window = [START, new Date(Date.parse(START) + 86400000).toISOString()];
const cell = (result: Awaited<ReturnType<typeof db.query>>) => {
  const value = result.result_sets[0].rows?.[0]?.[0];
  return typeof value === 'string' ? JSON.parse(value) : value;
};
try {
  const qualitySql = await readFile(
    new URL('../db/quality.sql', import.meta.url),
    'utf8',
  );
  const quality = cell(await db.query(qualitySql, window));
  assertQuality(quality);

  // Exercise the real SQL with temporary CTE values; no tables are written.
  // Four rows from two sensors must not pass as a complete bucket.
  const regressionSql = qualitySql
    .replace(
      'WITH bounded',
      `WITH input_readings(time,zone_id,sensor_id,temperature_c) AS (
      VALUES ($1::timestamptz,'A1','A1-1',7),
        ($1::timestamptz + INTERVAL '1 minute','A1','A1-1',7),
        ($1::timestamptz,'A1','A1-2',7),
        ($1::timestamptz + INTERVAL '1 minute','A1','A1-2',7),
        ($1::timestamptz,'A1','unexpected',7)
    ), input_zones(id,expected_sensors,upper_limit_c) AS (VALUES ('A1',4,5)), bounded`,
    )
    .replaceAll('frostline.readings', 'input_readings')
    .replaceAll('frostline.zones', 'input_zones');
  const invalid = cell(await db.query(regressionSql, window));
  assert.equal(invalid.duplicateSensorBuckets, 2);
  assert.equal(invalid.unexpectedSensors, 1);
  assert.throws(() => assertQuality(invalid), /duplicateSensorBuckets/);

  const diagnostics = cell(
    await db.query(
      await readFile(new URL('../db/diagnostics.sql', import.meta.url), 'utf8'),
      window,
    ),
  );
  assert.equal(
    diagnostics.rawReadings,
    6892,
    'Expected the reproducible demo shift',
  );
  assert.equal(diagnostics.zones, 6);
  assert.equal(diagnostics.materializedBuckets, 1723);
  assert.equal(
    diagnostics.rollupMismatches,
    0,
    'Rollup differs from raw readings; inspect refresh coverage',
  );
  const plan = cell(
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT time,sensor_id,temperature_c FROM frostline.readings
    WHERE zone_id=$1 AND time >= $2::timestamptz AND time < $3::timestamptz
    ORDER BY time DESC`,
      ['B2', '2026-09-04T17:45:00Z', '2026-09-04T18:00:00Z'],
    ),
  );
  console.log(
    JSON.stringify(
      { diagnostics, quality, sqlRegression: 'passed', queryPlan: plan },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
