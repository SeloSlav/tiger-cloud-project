-- Degree-minutes of zone-average temperature above the operational limit.
-- This is a discrete integral over completed, fully observed 5-minute buckets.
SELECT z.id AS zone_id,
       round(COALESCE(sum(GREATEST(a.temperature-z.upper_limit_c,0)*5)
         FILTER(WHERE a.sensors=z.expected_sensors),0)::numeric,2)::double precision AS debt
FROM frostline.zones z
LEFT JOIN frostline.zone_5m a ON a.zone_id=z.id
  AND a.bucket >= $1::timestamptz AND a.bucket < $2::timestamptz
GROUP BY z.id ORDER BY z.id;
