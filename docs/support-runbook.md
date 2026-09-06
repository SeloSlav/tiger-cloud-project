# Frostline database support walkthrough

The demo turns a manufacturing question—“Which chilled production area warmed, for how long, and what data is missing?”—into bounded PostgreSQL queries. Three.js supplies spatial context. TimescaleDB stores the sensor history and materializes the recurring aggregation.

The facility is fictional and all readings are synthetic. The following evidence comes from running the project's SQL on a real Tiger Cloud DEV service.

## Verified state

Checked on **6 September 2026, 17:27 UTC**, through Tiger MCP:

| Check                                              | Observed result                                |
| -------------------------------------------------- | ---------------------------------------------- |
| PostgreSQL / TimescaleDB                           | 18.4 / 2.29.2                                  |
| Raw readings / zones                               | 6,892 / 6                                      |
| Materialized five-minute buckets                   | 1,723                                          |
| Replay grid                                        | 1,728 slots, including five missing C1 buckets |
| Raw-to-rollup mismatches                           | 0                                              |
| Duplicate sensor buckets / unknown sensor readings | 0 / 0                                          |
| Continuous aggregate job                           | Last run successful; 0 failures                |
| Columnstore job                                    | Last run successful; 0 failures                |
| Raw chunk                                          | 4–5 September UTC, still in row storage        |

The raw chunk is younger than the seven-day columnstore threshold. A successful policy job does not mean it found an eligible chunk to convert. This demo demonstrates policy configuration, not measured compression savings.

Reproduce the checks:

```sh
npm ci
tiger auth login
# Configure TIGER_SERVICE_ID and save the database password with Tiger CLI.
npm run db:verify:mcp
npm run data:sync:mcp
```

`db:verify:mcp` only reads the database. It reports current values, exercises SQL regression cases without writing tables, and executes one bounded SELECT under EXPLAIN ANALYZE. The exporter verifies all six SQL exposure totals against TypeScript before replacing the JSON snapshot. No credentials are printed or included in the website.

## A connection recommendation with populated tables

An onboarding banner saying “Add data to your service” does not establish that every schema is empty. Check the selected service and actual objects before provisioning anything:

```sql
SELECT current_database(), current_user;
SELECT to_regclass('frostline.readings');
SELECT count(*), min(time), max(time) FROM frostline.readings;
SELECT hypertable_schema, hypertable_name, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_schema = 'frostline';
```

Here the existing service already contained the demo. The onboarding banner's reason was not established; creating a second service would not resolve that discrepancy.

Account authentication, database authentication and TLS trust are separate checks. CLI OAuth can expire while a saved database password remains valid. During this validation the direct `pg` client rejected the certificate chain with `SELF_SIGNED_CERT_IN_CHAIN`; the official Tiger MCP connection succeeded using its encrypted CLI defaults. That is not evidence that the direct certificate problem has been resolved. The direct client retains certificate verification; investigate the presented chain and obtain a trusted CA through the provider before treating that path as healthy. See [Tiger's SSL documentation](https://docs.timescale.com/use-timescale/latest/security/strict-ssl/).

## A chart stays stale after new readings arrive

Follow the data in order: raw rows → materialized aggregate → exported JSON → deployed build. The website intentionally does not query Tiger at runtime.

1. Confirm the raw timestamps and zone in the affected interval.
2. Run `db:verify:mcp` to compare the raw mean/count with the materialized result.
3. Inspect `timescaledb_information.jobs` and `job_stats` for refresh offsets, failures and last run time.
4. Check whether the interval falls inside the two-day refresh window. The aggregate excludes the newest five minutes and uses `materialized_only=true`.
5. For a known historical backfill, refresh its explicit window, export, and rebuild. A successful database refresh cannot change a previously published static file.

The seed performs this bounded historical refresh after inserting the synthetic shift:

```sql
CALL refresh_continuous_aggregate(
  'frostline.zone_5m',
  '2026-09-04T00:00:00Z'::timestamptz,
  '2026-09-05T00:00:00Z'::timestamptz
);
```

This refresh statement changes the materialization; use it only for the intended backfill window. Before introducing retention, align raw retention and refresh windows so refreshing an interval after its raw rows have been removed does not erase the desired historical aggregate.

## Four readings do not necessarily mean four sensors

The original row-count check could accept four rows from two repeatedly reporting sensors. This matters because a plausible average can conceal missing equipment.

`db/quality.sql` now verifies one sample per known sensor per five-minute bucket before either exporter publishes. Repeated samples or unexpected sensor identities fail the export. Absent sensors are allowed: their incomplete buckets remain unknown. The client also rejects counts above four, matching SQL's exact completeness condition.

The SQL regression supplies repeated and unknown sensor readings through CTE values, detects both, and verifies the exporter rejects the result. It writes no test rows to the service. For irregular real-world sampling, use explicit sensor membership and per-sensor aggregation or time weighting rather than assuming a sample count proves equal coverage.

## Reading a query plan

The diagnostic command executes:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT time, sensor_id, temperature_c
FROM frostline.readings
WHERE zone_id = 'B2'
  AND time >= '2026-09-04T17:45:00Z'::timestamptz
  AND time <  '2026-09-04T18:00:00Z'::timestamptz
ORDER BY time DESC;
```

The observed plan used the chunk's **time index**, then filtered by zone. It estimated **15 rows** and returned **12**, removing **60** other-zone rows. It hit **3 shared buffers** without physical reads; planning took **1.551 ms** and execution **0.071 ms** in that single run. Client, MCP and network overhead are not included in PostgreSQL's execution time.

The schema also has a `(zone_id, time DESC)` index. Its existence does not mean the planner will choose it: a narrow interval on this tiny six-zone dataset is cheap to scan through the time index. This plan alone does not justify forcing another index or claiming a speedup.

For a customer's slow query, first capture the exact SQL, bound parameters, affected time span and expected result. Compare estimated and actual rows, rows discarded, chunk selection, buffer reads, sorts/spills and lock waits. Check statistics and workload before proposing an index. Re-test against representative data and concurrency; this 6,892-row sample cannot establish production capacity. `EXPLAIN ANALYZE` executes its statement, so these diagnostics deliberately use a bounded SELECT. See [PostgreSQL's EXPLAIN guide](https://www.postgresql.org/docs/current/using-explain.html).

## Customer update and escalation

An update should identify impact, what has been confirmed, what remains uncertain, and the next check. For this example:

> The existing database contains the six production zones and the materialized readings match the raw data. The public dashboard displays a saved shift, so new database rows appear after an export and deployment. I’m checking the requested time window against the refresh policy before publishing the updated archive.

An escalation should include sanitized query text and parameters, extension/PostgreSQL versions, the incident timeline in UTC, query plan, relevant job errors, scope of affected zones, reproduction steps and attempted mitigations. Exclude passwords and connection strings with credentials. Keep ownership of the customer update while engineering investigates.
