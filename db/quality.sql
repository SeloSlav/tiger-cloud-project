-- The demo's ingestion contract is one reading per known sensor per bucket.
-- A row count alone cannot distinguish four sensors from repeated samples.
-- Missing sensors are allowed and stay unknown in the replay.
WITH bounded AS (
  SELECT * FROM frostline.readings
  WHERE time >= $1::timestamptz AND time < $2::timestamptz
), duplicates AS (
  SELECT time_bucket(INTERVAL '5 minutes', time), zone_id, sensor_id
  FROM bounded GROUP BY 1,2,3 HAVING count(*) > 1
), expected AS (
  SELECT z.id AS zone_id, z.id || '-' || n AS sensor_id
  FROM frostline.zones z CROSS JOIN LATERAL generate_series(1,z.expected_sensors) n
)
SELECT jsonb_build_object(
  'duplicateSensorBuckets', (SELECT count(*) FROM duplicates),
  'unexpectedSensors', (SELECT count(*) FROM bounded b LEFT JOIN expected e
    USING(zone_id,sensor_id) WHERE e.sensor_id IS NULL),
  'invalidZoneConfiguration', (SELECT count(*) FROM frostline.zones
    WHERE expected_sensors <> 4 OR upper_limit_c <> 5)
) AS quality;
