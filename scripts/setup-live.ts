import { readFile } from 'node:fs/promises';
import { openTiger } from './mcp-database';
const db = await openTiger();
try {
  for (const file of ['002_live.sql', '003_monitor.sql'])
    await db.query(
      await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8'),
    );
  // Backfill once during installation, never paper over a later outage.
  await db.query(`INSERT INTO frostline_live.readings
    SELECT * FROM frostline_live.simulated_readings(date_trunc('minute',now())-INTERVAL '3 days',date_trunc('minute',now()))
    WHERE EXISTS (SELECT 1 FROM frostline_live.simulation WHERE seeded_at IS NULL)
    ON CONFLICT DO NOTHING;
    UPDATE frostline_live.simulation SET seeded_at=now() WHERE seeded_at IS NULL;`);
  await db.query(
    `CALL refresh_continuous_aggregate('frostline_live.zone_5m',now()-INTERVAL '4 days',time_bucket('5 minutes',now()));`,
  );
  await db.query(`CALL frostline_live.collect_sensors(NULL,NULL);`);
  await db.query(`SELECT add_job('frostline_live.collect_sensors',INTERVAL '1 minute',
    fixed_schedule=>true,initial_start=>date_trunc('minute',now())+INTERVAL '1 minute')
    WHERE NOT EXISTS (SELECT 1 FROM timescaledb_information.jobs
      WHERE proc_schema='frostline_live' AND proc_name='collect_sensors');`);
  console.log(
    'Live sensor registry, hypertable, rollup, incidents and background collector installed.',
  );
} finally {
  db.close();
}
