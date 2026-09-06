-- All project objects live in an isolated schema; no destructive reset.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS frostline;
CREATE TABLE IF NOT EXISTS frostline.zones (
  id text PRIMARY KEY, name text NOT NULL, cargo text NOT NULL,
  upper_limit_c double precision NOT NULL DEFAULT 5,
  expected_sensors integer NOT NULL DEFAULT 4
);
CREATE TABLE IF NOT EXISTS frostline.readings (
  time timestamptz NOT NULL,
  zone_id text NOT NULL REFERENCES frostline.zones(id),
  sensor_id text NOT NULL,
  temperature_c double precision NOT NULL CHECK(temperature_c BETWEEN -50 AND 60),
  PRIMARY KEY (time, sensor_id)
);
SELECT create_hypertable('frostline.readings', by_range('time', INTERVAL '1 day'), if_not_exists => true);
CREATE INDEX IF NOT EXISTS readings_zone_time ON frostline.readings (zone_id,time DESC);

-- Raw readings stay available, while repeated replay queries use a materialized
-- five-minute rollup. Materialized-only makes the snapshot watermark explicit.
CREATE MATERIALIZED VIEW IF NOT EXISTS frostline.zone_5m
WITH (timescaledb.continuous, timescaledb.materialized_only=true) AS
SELECT time_bucket(INTERVAL '5 minutes', time) AS bucket,
       zone_id,
       round(avg(temperature_c)::numeric, 2)::double precision AS temperature,
       count(*)::integer AS sensors,
       max(temperature_c) AS peak_sensor_temperature
FROM frostline.readings
GROUP BY bucket, zone_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('frostline.zone_5m',
  start_offset => INTERVAL '2 days', end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => true);

-- Hypercore moves older chunks into columnar storage. The historical fixture
-- is explicitly refreshed by the seed script rather than relying on a job.
ALTER TABLE frostline.readings SET (
  timescaledb.enable_columnstore=true,
  timescaledb.segmentby='zone_id,sensor_id',
  timescaledb.orderby='time DESC'
);
CALL add_columnstore_policy('frostline.readings', after => INTERVAL '7 days', if_not_exists => true);
