-- Bound the query and preserve absent buckets. Never LOCF across a sensor gap.
WITH ticks AS (
  SELECT generate_series($1::timestamptz, $2::timestamptz - INTERVAL '5 minutes', INTERVAL '5 minutes') AS bucket
)
SELECT t.bucket AS time, z.id AS zone_id,
       CASE WHEN a.sensors = z.expected_sensors THEN a.temperature ELSE NULL END AS temperature,
       COALESCE(a.sensors,0) AS sensors
FROM ticks t CROSS JOIN frostline.zones z
LEFT JOIN frostline.zone_5m a ON a.bucket=t.bucket AND a.zone_id=z.id
ORDER BY t.bucket,z.id;
