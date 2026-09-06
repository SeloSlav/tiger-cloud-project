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
