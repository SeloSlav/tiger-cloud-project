# Live monitoring at Nori Works

Frostline's working product is a monitoring surface for chilled sushi production areas. It answers three questions: what is happening now, what has happened over the last day, and which sustained temperature incidents are still open?

The facility and sensor adapter are simulated. Ingestion, aggregation, incident persistence, storage policies and API reads run on the actual Tiger service. The worker animation is independent visual activity; it does not claim to track physical employees or production throughput.

## Runtime

| Component | Responsibility |
| --- | --- |
| Tiger `frostline_live.sensors` | Registry of 24 sensors assigned to six zones |
| Tiger `frostline_live.readings` | One-minute observations, daily hypertable chunks |
| Tiger background job | Collect a current observation every minute and evaluate incidents |
| Tiger `frostline_live.zone_5m` | Continuous aggregate with materialized history and a real-time raw tail |
| Tiger `frostline_live.incidents` | Persisted opening, confirmation, peak, last observation and recovery |
| Vercel `/api/monitor` | A bounded read-only database query, cached for 15 seconds |
| GitHub Pages / Sites | React and Three.js interface, polling every 30 seconds while visible |

The backend is deployed in **martin-selooilscom's Team (Pro)**. The original GitHub Pages link remains the frontend. It contains a public API URL, never a database credential.

## Data and incident rules

Each registered sensor produces at most one observation per minute. A composite foreign key checks its zone membership; the primary key and timestamp-alignment check prevent repeated observations within the same minute.

An incident opens after **three consecutive complete observations above 5 °C**. It recovers after **two complete observations at or below 4.5 °C**. The lower recovery threshold reduces flapping. Partial coverage cannot open a new incident or falsely resolve an existing one. Repeated evaluation cannot create duplicate open incidents for one zone.

The simulator uses a deterministic 90-minute cycle with warming events on the maki and packing lines and a brief missing sensor on the nigiri line. It seeds three days once, then collects only the current minute. It does not fill a later outage with invented backdated readings. Incident recording begins when monitoring starts; backfilled temperature history does not claim that historical incidents were observed by an operator.

The current-temperature cards use the newest raw observation. The rolling chart and degree-minute totals use only completed five-minute buckets with all **20 expected samples from four sensors**. The public payload includes independent SQL totals, which the client verifies against its calculation. Missing coverage remains a gap. After three minutes without sensor data, current values become unknown even if HTTP requests still succeed.

## Storage lifecycle

- Raw chunks move into Hypercore columnar storage after **one day**.
- Raw observations expire after **seven days**.
- Five-minute aggregates expire after **thirty days**.
- Aggregate refresh covers only the most recent **two hours**, excluding the latest five minutes. Real-time aggregation includes the unmaterialized tail when queried.

The short refresh window stays inside raw retention. This avoids routinely refreshing an old interval after its source readings have expired. The original `frostline` archive uses independent tables and is not affected by these policies.

On 6 September 2026, two eligible chunks converted from **5,513,216 bytes to 466,944 bytes** (about **91.5% smaller**, including their reported indexes and TOAST). These values came from `chunk_columnstore_stats('frostline_live.readings')`; they describe this small, regular synthetic dataset, not a general workload guarantee. A fresh query still returned complete rolling history after conversion.

## Setup on a separate DEV service

Configure `TIGER_SERVICE_ID` in ignored `.env.database`, authenticate Tiger CLI and save that service's database password in its credential store. The original zone schema must exist; `npm run db:seed:mcp` creates it for a fresh installation.

```sh
npm run db:setup:live
npm run db:verify:live
npm run db:role:live
```

Setup is repeatable and registers one collector. It seeds history once. Role creation deliberately refuses to overwrite `.env.live` or reset an existing database role. On Windows, restrict `.env.live` to the owning user with a file ACL; all `.env*` files except the template are ignored by Git and excluded from deployment uploads.

The generated `frostline_monitor` role has no administrative privileges, defaults to read-only transactions, and has an eight-second statement timeout. It can only execute the fixed `monitor_snapshot()` function within this schema. That SECURITY DEFINER function has a fixed search path, fully qualified application objects and no user-provided SQL. The API rejects methods other than GET/OPTIONS and rejects query parameters. Its connection pool is capped at two per process, with a database role connection limit of eight.

Set `FROSTLINE_DATABASE_URL` as an encrypted Vercel secret using the restricted role's URL in `.env.live`. Set `FROSTLINE_TLS_MODE` explicitly for the service. **`verify-full` is the default.** Tiger's free services have self-signed certificates, so this deployed DEV connection uses **`require`**, which encrypts traffic without CA verification and matches the official CLI's default. This choice is documented rather than silently applied after a TLS error. For a publicly signed certificate, retain `verify-full`. [Tiger's SSL documentation](https://www.tigerdata.com/docs/use-timescale/latest/security/strict-ssl/).

```sh
npx vercel link --project frostline-monitor --scope martin-selooilscom-s-team
npx vercel env add FROSTLINE_DATABASE_URL production --sensitive --scope martin-selooilscom-s-team
npx vercel env add FROSTLINE_TLS_MODE production --scope martin-selooilscom-s-team
npx vercel deploy --prod --scope martin-selooilscom-s-team
```

These scope arguments name this deployment's Pro team; substitute your own team for a fork. `vercel.json` builds the API only, and `.vercelignore` excludes local secrets, working files and frontend assets. GitHub integration is not configured for the Vercel project; API code updates use the deployment command above. Frontend pushes deploy automatically through GitHub Pages. Update `MONITOR_URL` in `components/use-live-monitor.ts` if your API receives a different domain.

## Verify and operate

`npm run db:verify:live` exercises incident opening, repeated evaluation, incomplete coverage and recovery in a transaction that is rolled back. It then checks the running collector and validates SQL/client exposure parity across all six zones. Unit tests cover corrupted histories, mismatched exposure totals, stale feeds and the initial unknown state.

Inspect the public endpoint without credentials:

```sh
curl https://frostline-monitor.vercel.app/api/monitor
```

Compare `latestReadingAt` across minute boundaries to verify collection independent of browser activity. `queriedAt` is the database query time and is not a substitute for sensor freshness. The latest collector result is included for diagnosis. The dashboard retains last-known history during an API error and visibly marks interrupted updates.

Pause the simulator without deleting its data:

```sql
SELECT alter_job(job_id,scheduled=>false)
FROM timescaledb_information.jobs
WHERE proc_schema='frostline_live' AND proc_name='collect_sensors';
```

Use `scheduled=>true` to resume. The next run records the current minute; the intervening gap stays visible. Inspect all project jobs with:

```sql
SELECT j.job_id,j.proc_name,j.schedule_interval,s.last_run_status,s.total_failures
FROM timescaledb_information.jobs j
LEFT JOIN timescaledb_information.job_stats s USING(job_id)
WHERE j.proc_schema='frostline_live' OR j.hypertable_schema='frostline_live';
```

## Boundaries

This is one facility with simulated hardware inputs and a public read-only monitoring view. It has no customer accounts, tenant isolation, operator acknowledgements, notification delivery, or commercial uptime commitment. Connecting physical sensors would replace the simulation adapter with an authenticated ingestion gateway while retaining the registry, database constraints, aggregation and incident logic. A commercial deployment would also need customer access controls, verified TLS, representative load testing and recovery procedures.
