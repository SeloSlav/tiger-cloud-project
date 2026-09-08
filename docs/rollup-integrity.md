# Rollup integrity

The live dashboard now asks whether its five-minute history agrees with the underlying observations. This is separate from sensor freshness, job success, and the existing SQL/client thermal-debt check: both exposure calculations consume the same rollup and can agree while that rollup is stale.

TimescaleDB real-time aggregates combine materialized history with newer raw data. They do **not** immediately incorporate late arrivals or corrections inside an already-materialized bucket; that portion needs a scheduled or manual refresh. See [Tiger's explanation of historical consistency](https://www.tigerdata.com/docs/learn/continuous-aggregates/real-time-aggregates#real-time-aggregates-and-refreshing-historical-data).

## What the check means

`frostline_live.rollup_integrity()` compares the raw hypertable with `frostline_live.zone_5m` in a single SQL snapshot. Its half-open window is `[time_bucket('5 minutes', now()) − 70 minutes, time_bucket('5 minutes', now()) − 10 minutes)`. Leaving ten minutes allows for the configured five-minute refresh lag and five-minute schedule. This is a grace period, not a refresh completion guarantee or a materialization watermark.

An explicit time grid crossed with all six zones produces **72 zone buckets**, including fully absent intervals. Each raw bucket is recomputed using the same definition as the aggregate, comparing sample count, distinct sensors, rounded mean, and peak. Comparing peaks catches changes that cancel out in the mean. A bucket needs 20 samples from four registered sensors for complete source coverage.

| Dashboard result  | Meaning                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| All buckets match | All 72 checked buckets agree and have complete raw coverage.                                            |
| Source has gaps   | The rollup matches the source, but some raw buckets are incomplete or absent.                           |
| History differs   | At least one bucket differs; inspect refresh and the affected zone before relying on historical totals. |
| Check out of date | The database comparison is older than 90 seconds, or API polling is interrupted.                        |
| Check unavailable | The API has not supplied this capability; the rest of monitoring still works.                           |

Missingness and drift can overlap. An absent bucket on both sides is a source gap, not a mismatch. A correction with unchanged sample counts can still be drift. A successful refresh job is supporting context, not proof that every bucket matches. Checks use database query time for freshness, independently of the age of sensor readings.

The panel's expandable table shows per-zone sample counts, differences, incomplete source buckets and the first differing bucket. Zone buttons select that zone in the existing floor and history views. Last successful refresh and the next scheduled run come from TimescaleDB's information views.

## Installation and access

New installations include the check via `npm run db:setup:live`. To update only the monitoring functions on an existing DEV service:

```sh
npm run db:update:monitor
npm run db:verify:live
```

Both use the real Tiger stdio MCP. `db:update:monitor` applies `db/003_monitor.sql` atomically with bounded statement and lock timeouts; it neither reseeds history nor changes background policies. `CREATE OR REPLACE` preserves the existing monitor function's EXECUTE grant.

The helper uses invoker permissions with a fixed search path and revoked PUBLIC access. Only the existing `SECURITY DEFINER monitor_snapshot()` exposes its bounded summary. The public API role still cannot select raw tables or run refreshes. The new JSON field is additive, so the existing Vercel endpoint needs no code change. Frontends backed by an older API show the unavailable state.

## Verified using the connected Tiger MCP

On 8 September 2026, the check ran against the project's DEV service on TimescaleDB **2.29.2**. The 08:05–09:05 UTC window had 72 matching buckets and two incomplete source buckets in C1. C1 had 235 raw and 235 rollup samples; the other five zones each had 240. The deliberate missing sensor was correctly classified as missing coverage, not stale aggregation.

`db/integrity-regression.sql` verified all of the following against the actual materialized history in a repeatable-read transaction, then rolled everything back:

- Correcting a historical sample causes one mismatch without making source coverage incomplete.
- Raising one peak and lowering another reading by the same amount is detected even when the bucket mean stays the same.
- Removing one historical sample produces both a mismatch and an incomplete source bucket.
- Restoring the original samples returns the comparison to its baseline.

Every test mutation has a direct time predicate so TimescaleDB can prune unrelated, potentially columnar chunks. The check does not disable decompression limits. Tests require a complete, initially matching A1 bucket 40 minutes ago; they fail explicitly if that prerequisite is absent. Browser tests are not part of this verification.

## Investigating a difference

1. Inspect the affected zone and first differing bucket in the panel. Check whether the refresh job is paused or failing. A mismatch alone does not identify its cause.
2. For a late arrival within the current two-hour policy window, allow the next successful scheduled refresh and recheck. Changes older than that window need an explicit bounded refresh.
3. Before a manual refresh, confirm the raw data still exists for the entire interval. Raw retention is seven days while aggregate retention is thirty days; refreshing expired raw history can remove retained summary data.
4. Refresh only the affected complete buckets using the operator's database connection, then verify again. For example, for a confirmed difference in a retained 08:30 UTC bucket:

```sql
CALL refresh_continuous_aggregate(
  'frostline_live.zone_5m',
  TIMESTAMPTZ '2026-09-08 08:30:00+00',
  TIMESTAMPTZ '2026-09-08 08:35:00+00'
);
```

The example must be adapted to the observed interval and retention state; the dashboard never executes it. It also never replaces missing source data with interpolation.

## Bounds

This is an audit of the one-hour window shown, not all retained history. It compares the query-visible real-time aggregate, so agreement does not establish how much data is physically materialized. It neither automatically repairs data nor substitutes for an ingestion policy for late arrivals. The additional scan is at most 1,440 raw samples for this fixed registry and cadence, plus 72 aggregate rows. Larger facilities would need a measured audit cadence or persisted reconciliation job instead of assuming this per-request scan scales without cost.
