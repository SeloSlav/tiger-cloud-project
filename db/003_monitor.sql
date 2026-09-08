-- Reconcile one hour of completed zone buckets, leaving ten minutes for the
-- five-minute refresh lag + schedule. Both sides share the caller's snapshot.
-- This is intentionally inside raw retention; never refresh expired source data.
CREATE OR REPLACE FUNCTION frostline_live.rollup_integrity()
RETURNS jsonb LANGUAGE SQL STABLE
SET search_path=pg_catalog,public AS $$
WITH bounds AS (
  SELECT time_bucket(INTERVAL '5 minutes',now())-INTERVAL '10 minutes' AS finish
), raw AS (
  SELECT time_bucket(INTERVAL '5 minutes',r.time) AS bucket,r.zone_id,
    count(*)::integer AS samples,count(DISTINCT r.sensor_id)::integer AS sensors,
    round(avg(r.temperature_c)::numeric,2)::double precision AS temperature,
    max(r.temperature_c) AS peak
  FROM frostline_live.readings r CROSS JOIN bounds b
  WHERE r.time>=b.finish-INTERVAL '1 hour' AND r.time<b.finish
  GROUP BY 1,2
), rollup AS (
  SELECT a.* FROM frostline_live.zone_5m a CROSS JOIN bounds b
  WHERE a.bucket>=b.finish-INTERVAL '1 hour' AND a.bucket<b.finish
), compared AS (
  SELECT z.id,t.bucket,coalesce(r.samples,0) AS raw_samples,
    coalesce(a.samples,0) AS rollup_samples,
    (coalesce(r.samples,0)<>20 OR coalesce(r.sensors,0)<>4) AS incomplete,
    (coalesce(r.samples,0)<>coalesce(a.samples,0)
      OR coalesce(r.sensors,0)<>coalesce(a.sensors,0)
      OR r.temperature IS DISTINCT FROM a.temperature
      OR r.peak IS DISTINCT FROM a.peak) AS mismatch
  FROM bounds b CROSS JOIN LATERAL generate_series(
    b.finish-INTERVAL '1 hour',b.finish-INTERVAL '5 minutes',INTERVAL '5 minutes'
  ) t(bucket) CROSS JOIN frostline.zones z
  LEFT JOIN raw r ON r.bucket=t.bucket AND r.zone_id=z.id
  LEFT JOIN rollup a ON a.bucket=t.bucket AND a.zone_id=z.id
), zones AS (
  SELECT id AS "zoneId",count(*)::integer AS "checkedBuckets",
    count(*) FILTER (WHERE mismatch)::integer AS "mismatchedBuckets",
    count(*) FILTER (WHERE incomplete)::integer AS "incompleteRawBuckets",
    sum(raw_samples)::integer AS "rawSamples",sum(rollup_samples)::integer AS "rollupSamples",
    min(bucket) FILTER (WHERE mismatch) AS "firstMismatchAt"
  FROM compared GROUP BY id
)
SELECT jsonb_build_object(
  'windowStart',b.finish-INTERVAL '1 hour','windowEnd',b.finish,'graceMinutes',10,
  'zones',(SELECT jsonb_agg(z ORDER BY z."zoneId") FROM zones z),
  'refresh',(
    SELECT jsonb_build_object('scheduled',j.scheduled,'lastStatus',s.last_run_status,
      'lastFinishedAt',s.last_successful_finish,'nextStart',CASE WHEN isfinite(s.next_start) THEN s.next_start END)
    FROM timescaledb_information.jobs j LEFT JOIN timescaledb_information.job_stats s USING(job_id)
    WHERE j.hypertable_schema='frostline_live' AND j.hypertable_name='zone_5m'
      AND j.proc_name='policy_refresh_continuous_aggregate' LIMIT 1
  )
) FROM bounds b;
$$;
REVOKE ALL ON FUNCTION frostline_live.rollup_integrity() FROM PUBLIC;

-- One bounded, parameter-free read API. The application's role receives only
-- EXECUTE on this function; it cannot write or issue arbitrary table queries.
CREATE OR REPLACE FUNCTION frostline_live.monitor_snapshot()
RETURNS jsonb LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
WITH bounds AS (
  SELECT time_bucket(INTERVAL '5 minutes',now()) AS finish
), ticks AS (
  SELECT t FROM bounds b CROSS JOIN LATERAL
    generate_series(b.finish-INTERVAL '24 hours',b.finish-INTERVAL '5 minutes',INTERVAL '5 minutes') t
), history AS (
  SELECT z.id,t.t,
    CASE WHEN a.samples=20 AND a.sensors=4 THEN a.temperature END AS temperature,
    CASE WHEN a.samples=20 AND a.sensors=4 THEN 4 ELSE 0 END AS sensors
  FROM ticks t CROSS JOIN frostline.zones z
  LEFT JOIN frostline_live.zone_5m a ON a.zone_id=z.id AND a.bucket=t.t
), grouped AS (
  SELECT id,jsonb_agg(jsonb_build_object('time',to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'temperature',temperature,'sensors',sensors) ORDER BY t) AS points
  FROM history GROUP BY id
), debt AS (
  SELECT id,round(coalesce(sum(greatest(temperature-5,0)*5) FILTER(WHERE sensors=4),0)::numeric,2) AS total
  FROM history GROUP BY id
), recent AS (
  SELECT time,zone_id,count(*)::integer AS sensors,
    round(avg(temperature_c)::numeric,2)::double precision AS temperature
  FROM frostline_live.readings WHERE time>=now()-INTERVAL '5 minutes' GROUP BY time,zone_id
), latest AS (
  SELECT DISTINCT ON(zone_id) * FROM recent ORDER BY zone_id,time DESC
), current_zones AS (
  SELECT z.id,jsonb_build_object('lastSeen',a.time,'sensors',CASE WHEN a.time>=now()-INTERVAL '3 minutes' THEN coalesce(a.sensors,0) ELSE 0 END,
    'temperature',CASE WHEN a.sensors=4 AND a.time>=now()-INTERVAL '3 minutes' THEN a.temperature END) AS state
  FROM frostline.zones z LEFT JOIN latest a ON a.zone_id=z.id
), incidents AS (
  SELECT i.id::text,i.zone_id AS "zoneId",i.started_at AS "startedAt",
    i.confirmed_at AS "confirmedAt",i.resolved_at AS "resolvedAt",
    i.last_observed_at AS "lastObservedAt",round(i.peak_temperature::numeric,2) AS "peakTemperature"
  FROM frostline_live.incidents i WHERE started_at>=now()-INTERVAL '24 hours'
  ORDER BY (resolved_at IS NULL) DESC,started_at DESC LIMIT 20
)
SELECT jsonb_build_object(
  'version',1,'queriedAt',now(),'latestReadingAt',(SELECT max(time) FROM latest),
  'integrity',frostline_live.rollup_integrity(),
  'current',(SELECT jsonb_object_agg(id,state) FROM current_zones),
  'incidents',coalesce((SELECT jsonb_agg(i) FROM incidents i),'[]'::jsonb),
  'collector',(SELECT jsonb_build_object('scheduled',j.scheduled,'lastStatus',s.last_run_status,
    'lastFinishedAt',s.last_successful_finish)
    FROM timescaledb_information.jobs j LEFT JOIN timescaledb_information.job_stats s USING(job_id)
    WHERE j.proc_schema='frostline_live' AND j.proc_name='collect_sensors' LIMIT 1),
  'history',jsonb_build_object('version',1,'source','tiger','generatedAt',now(),'intervalMinutes',5,
    'rawReadings',(SELECT count(*) FROM frostline_live.readings WHERE time>=now()-INTERVAL '24 hours'),
    'engine',(SELECT 'TimescaleDB '||extversion FROM pg_extension WHERE extname='timescaledb'),
    'zones',(SELECT jsonb_object_agg(id,points) FROM grouped),
    'sqlDebt',(SELECT jsonb_object_agg(id,total) FROM debt))
);
$$;
REVOKE ALL ON FUNCTION frostline_live.monitor_snapshot() FROM PUBLIC;
