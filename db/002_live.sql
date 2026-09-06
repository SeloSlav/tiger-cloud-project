-- Independent live monitoring tables preserve the original shift archive.
CREATE SCHEMA IF NOT EXISTS frostline_live;
CREATE TABLE IF NOT EXISTS frostline_live.sensors (
  id text PRIMARY KEY,
  zone_id text NOT NULL REFERENCES frostline.zones(id),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 4),
  UNIQUE (id,zone_id), UNIQUE (zone_id,ordinal)
);
INSERT INTO frostline_live.sensors(id,zone_id,ordinal)
SELECT z.id || '-' || n,z.id,n FROM frostline.zones z CROSS JOIN generate_series(1,4) n
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS frostline_live.readings (
  time timestamptz NOT NULL CHECK (EXTRACT(SECOND FROM time)=0),
  sensor_id text NOT NULL,
  zone_id text NOT NULL,
  temperature_c double precision NOT NULL CHECK (temperature_c BETWEEN -50 AND 60),
  PRIMARY KEY (time,sensor_id),
  FOREIGN KEY (sensor_id,zone_id) REFERENCES frostline_live.sensors(id,zone_id)
);
SELECT create_hypertable('frostline_live.readings',by_range('time',INTERVAL '1 day'),if_not_exists=>true);
CREATE INDEX IF NOT EXISTS live_zone_time ON frostline_live.readings(zone_id,time DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS frostline_live.zone_5m
WITH (timescaledb.continuous,timescaledb.materialized_only=false) AS
SELECT time_bucket(INTERVAL '5 minutes',time) AS bucket,zone_id,
  round(avg(temperature_c)::numeric,2)::double precision AS temperature,
  count(*)::integer AS samples, count(DISTINCT sensor_id)::integer AS sensors,
  max(temperature_c) AS peak
FROM frostline_live.readings GROUP BY bucket,zone_id WITH NO DATA;
SELECT add_continuous_aggregate_policy('frostline_live.zone_5m',
  start_offset=>INTERVAL '2 hours',end_offset=>INTERVAL '5 minutes',
  schedule_interval=>INTERVAL '5 minutes',if_not_exists=>true);
ALTER TABLE frostline_live.readings SET (
  timescaledb.enable_columnstore=true,
  timescaledb.segmentby='zone_id,sensor_id',timescaledb.orderby='time DESC'
);
CALL add_columnstore_policy('frostline_live.readings',after=>INTERVAL '1 day',if_not_exists=>true);
SELECT add_retention_policy('frostline_live.readings',drop_after=>INTERVAL '7 days',if_not_exists=>true);
SELECT add_retention_policy('frostline_live.zone_5m',drop_after=>INTERVAL '30 days',if_not_exists=>true);

CREATE TABLE IF NOT EXISTS frostline_live.simulation (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), epoch timestamptz NOT NULL,seeded_at timestamptz
);
ALTER TABLE frostline_live.simulation ADD COLUMN IF NOT EXISTS seeded_at timestamptz;
INSERT INTO frostline_live.simulation(id,epoch)
VALUES (true,date_trunc('minute',now())-INTERVAL '20 minutes') ON CONFLICT DO NOTHING;

-- A deterministic sensor adapter. Replace it with device ingestion when hardware
-- exists. Every inserted value has a sensor identity and actual observation time.
CREATE OR REPLACE FUNCTION frostline_live.simulated_readings(from_time timestamptz,to_time timestamptz)
RETURNS TABLE("time" timestamptz,sensor_id text,zone_id text,temperature_c double precision)
LANGUAGE SQL STABLE SET search_path=pg_catalog,public AS $$
  WITH ticks AS (
    SELECT t, floor(extract(epoch FROM (t-c.epoch))/60)::bigint AS minute
    FROM frostline_live.simulation c CROSS JOIN LATERAL
      generate_series(date_trunc('minute',from_time),date_trunc('minute',to_time),INTERVAL '1 minute') t
  ), phases AS (SELECT *,((minute%90)+90)%90 AS phase FROM ticks)
  SELECT p.t,s.id,s.zone_id,round((3.5 + .15*sin(p.minute/7.0+s.ordinal)
    + (s.ordinal-2.5)*.06
    + CASE WHEN s.zone_id='B2' AND p.phase BETWEEN 10 AND 35
        THEN 4.5*sin(pi()*(p.phase-10)/25.0)
      WHEN s.zone_id='C2' AND p.phase BETWEEN 45 AND 65
        THEN 3.7*sin(pi()*(p.phase-45)/20.0) ELSE 0 END)::numeric,2)::double precision
  FROM phases p CROSS JOIN frostline_live.sensors s
  WHERE NOT (s.id='C1-4' AND p.phase BETWEEN 70 AND 74)
$$;

CREATE TABLE IF NOT EXISTS frostline_live.incidents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id text NOT NULL REFERENCES frostline.zones(id),
  started_at timestamptz NOT NULL,
  confirmed_at timestamptz NOT NULL,
  resolved_at timestamptz,
  last_observed_at timestamptz NOT NULL,
  peak_temperature double precision NOT NULL,
  CHECK (resolved_at IS NULL OR resolved_at >= confirmed_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident_per_zone
  ON frostline_live.incidents(zone_id) WHERE resolved_at IS NULL;

-- Three consecutive full observations above 5 C open an incident. Two full
-- observations at/below 4.5 C close it. Missing data never implies recovery.
CREATE OR REPLACE PROCEDURE frostline_live.evaluate_incidents(at_time timestamptz)
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE z record; recent record;
BEGIN
  FOR z IN SELECT id FROM frostline.zones LOOP
    WITH minutes AS (
      SELECT time,avg(temperature_c) AS temperature
      FROM frostline_live.readings
      WHERE zone_id=z.id AND time BETWEEN at_time-INTERVAL '2 minutes' AND at_time
      GROUP BY time HAVING count(*)=4
    ) SELECT count(*) FILTER (WHERE temperature>5) AS warm,
      count(*) FILTER (WHERE time>=at_time-INTERVAL '1 minute' AND temperature<=4.5) AS cool,
      max(temperature) AS peak,max(time) AS last_seen INTO recent FROM minutes;

    IF recent.warm=3 THEN
      INSERT INTO frostline_live.incidents(zone_id,started_at,confirmed_at,last_observed_at,peak_temperature)
      VALUES(z.id,at_time-INTERVAL '2 minutes',at_time,at_time,recent.peak)
      ON CONFLICT (zone_id) WHERE resolved_at IS NULL DO NOTHING;
    END IF;
    UPDATE frostline_live.incidents SET
      peak_temperature=greatest(peak_temperature,recent.peak),
      last_observed_at=greatest(last_observed_at,recent.last_seen),
      resolved_at=CASE WHEN recent.cool=2 THEN at_time ELSE NULL END
    WHERE zone_id=z.id AND resolved_at IS NULL;
  END LOOP;
END $$;

CREATE OR REPLACE PROCEDURE frostline_live.collect_sensors(job_id integer,config jsonb)
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE observed_at timestamptz := date_trunc('minute',clock_timestamp());
BEGIN
  -- No historical catch-up after downtime: gaps must stay visible.
  INSERT INTO frostline_live.readings
  SELECT * FROM frostline_live.simulated_readings(observed_at,observed_at)
  ON CONFLICT (time,sensor_id) DO NOTHING;
  CALL frostline_live.evaluate_incidents(observed_at);
END $$;
