-- Read-only support report. Parameters: inclusive start, exclusive end (UTC).
WITH raw AS (
  SELECT time_bucket(INTERVAL '5 minutes', time) AS bucket, zone_id,
    round(avg(temperature_c)::numeric,2)::double precision AS temperature,
    count(*)::integer AS sensors
  FROM frostline.readings
  WHERE time >= $1::timestamptz AND time < $2::timestamptz
  GROUP BY 1,2
), rollup AS (
  SELECT * FROM frostline.zone_5m
  WHERE bucket >= $1::timestamptz AND bucket < $2::timestamptz
)
SELECT jsonb_build_object(
  'checkedAt', now(),
  'postgres', current_setting('server_version'),
  'timescaledb', (SELECT extversion FROM pg_extension WHERE extname='timescaledb'),
  'rawReadings', (SELECT count(*) FROM frostline.readings WHERE time >= $1 AND time < $2),
  'zones', (SELECT count(*) FROM frostline.zones),
  'materializedBuckets', (SELECT count(*) FROM rollup),
  'rollupMismatches', (SELECT count(*) FROM raw r FULL JOIN rollup a USING(bucket,zone_id)
    WHERE r.temperature IS DISTINCT FROM a.temperature OR r.sensors IS DISTINCT FROM a.sensors),
  'jobs', (SELECT jsonb_agg(jsonb_build_object(
    'procedure',j.proc_name,'lastStatus',s.last_run_status,
    'successes',s.total_successes,'failures',s.total_failures))
    FROM timescaledb_information.jobs j
    LEFT JOIN timescaledb_information.job_stats s USING(job_id)
    WHERE j.hypertable_schema='frostline'),
  'chunks', (SELECT jsonb_agg(jsonb_build_object(
    'start',range_start,'end',range_end,'columnstore',is_compressed))
    FROM timescaledb_information.chunks
    WHERE hypertable_schema='frostline' AND hypertable_name='readings')
) AS diagnostics;
