-- DEV-only regression. Every correction/deletion is isolated and rolled back.
-- Existing materialized data is needed to exercise historical invalidation.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='2s';
CREATE TEMP TABLE integrity_original ON COMMIT DROP AS
SELECT r.* FROM frostline_live.readings r
WHERE r.zone_id='A1'
  AND r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
  AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes';
DO $$
DECLARE result jsonb; baseline jsonb;
BEGIN
  IF (SELECT count(*) FROM integrity_original)<>20 THEN
    RAISE EXCEPTION 'Regression needs a complete A1 bucket 40 minutes ago';
  END IF;
  SELECT z INTO baseline FROM jsonb_array_elements(frostline_live.rollup_integrity()->'zones') z WHERE z->>'zoneId'='A1';
  IF (baseline->>'mismatchedBuckets')::integer<>0 THEN
    RAISE EXCEPTION 'Resolve existing A1 rollup drift before running the regression';
  END IF;

  -- A correction to materialized history must be detected even with real-time on.
  UPDATE frostline_live.readings r SET temperature_c=r.temperature_c+1
  WHERE r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
    AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes' AND r.zone_id='A1'
    AND (r.time,r.sensor_id)=(SELECT time,sensor_id FROM integrity_original ORDER BY time,sensor_id LIMIT 1);
  SELECT z INTO result FROM jsonb_array_elements(frostline_live.rollup_integrity()->'zones') z WHERE z->>'zoneId'='A1';
  IF (result->>'mismatchedBuckets')::integer<>1 OR (result->>'incompleteRawBuckets')::integer<>0 THEN
    RAISE EXCEPTION 'Historical correction was not detected separately from missingness: %',result;
  END IF;
  UPDATE frostline_live.readings r SET temperature_c=o.temperature_c FROM integrity_original o
  WHERE r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
    AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes' AND r.zone_id='A1'
    AND r.time=o.time AND r.sensor_id=o.sensor_id;

  -- Preserve the mean but increase the peak: a mean-only audit would miss this.
  UPDATE frostline_live.readings r SET temperature_c=r.temperature_c+1
  WHERE r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
    AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes' AND r.zone_id='A1'
    AND (r.time,r.sensor_id)=(SELECT time,sensor_id FROM integrity_original ORDER BY temperature_c DESC,time,sensor_id LIMIT 1);
  UPDATE frostline_live.readings r SET temperature_c=r.temperature_c-1
  WHERE r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
    AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes' AND r.zone_id='A1'
    AND (r.time,r.sensor_id)=(SELECT time,sensor_id FROM integrity_original ORDER BY temperature_c,time DESC,sensor_id DESC LIMIT 1);
  SELECT z INTO result FROM jsonb_array_elements(frostline_live.rollup_integrity()->'zones') z WHERE z->>'zoneId'='A1';
  IF (result->>'mismatchedBuckets')::integer<>1 THEN RAISE EXCEPTION 'Peak-only correction was missed'; END IF;
  UPDATE frostline_live.readings r SET temperature_c=o.temperature_c FROM integrity_original o
  WHERE r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
    AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes' AND r.zone_id='A1'
    AND r.time=o.time AND r.sensor_id=o.sensor_id;

  -- Removing a source sample is both incomplete coverage and stale aggregation.
  DELETE FROM frostline_live.readings r
  WHERE r.time>=time_bucket('5 minutes',now())-INTERVAL '40 minutes'
    AND r.time<time_bucket('5 minutes',now())-INTERVAL '35 minutes' AND r.zone_id='A1'
    AND (r.time,r.sensor_id)=(SELECT time,sensor_id FROM integrity_original ORDER BY time,sensor_id LIMIT 1);
  SELECT z INTO result FROM jsonb_array_elements(frostline_live.rollup_integrity()->'zones') z WHERE z->>'zoneId'='A1';
  IF (result->>'mismatchedBuckets')::integer<>1 OR (result->>'incompleteRawBuckets')::integer<>1
    OR (result->>'rawSamples')::integer<>(baseline->>'rawSamples')::integer-1 THEN
    RAISE EXCEPTION 'Missing source sample was not detected: %',result;
  END IF;
  INSERT INTO frostline_live.readings SELECT * FROM integrity_original ON CONFLICT DO NOTHING;
  SELECT z INTO result FROM jsonb_array_elements(frostline_live.rollup_integrity()->'zones') z WHERE z->>'zoneId'='A1';
  IF result IS DISTINCT FROM baseline THEN RAISE EXCEPTION 'Restored source should match the baseline'; END IF;
END $$;
ROLLBACK;
