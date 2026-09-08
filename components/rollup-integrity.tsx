'use client';

import { Database, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ZONES, timeLabel, type ZoneId } from '@/lib/telemetry';
import { integrityStatus } from '@/lib/rollup-integrity';
import type { LiveMonitor } from '@/lib/live-monitor';

export function RollupIntegrityPanel({
  monitor,
  now,
  interrupted,
  onSelect,
}: {
  monitor: LiveMonitor | null;
  now: number;
  interrupted: boolean;
  onSelect: (zone: ZoneId) => void;
}) {
  const integrity = monitor?.integrity;
  const status = integrityStatus(
    integrity,
    monitor?.queriedAt,
    now,
    interrupted,
  );
  const mismatches =
    integrity?.zones.reduce((n, z) => n + z.mismatchedBuckets, 0) ?? 0;
  const gaps =
    integrity?.zones.reduce((n, z) => n + z.incompleteRawBuckets, 0) ?? 0;
  const labels = {
    unavailable: 'Check unavailable',
    stale: 'Check out of date',
    drift: 'History differs',
    gaps: 'Source has gaps',
    verified: 'All buckets match',
  };
  const refresh = integrity?.refresh;
  return (
    <section className="integrity-panel" aria-labelledby="integrity-title">
      <div className="replay-heading">
        <div>
          <p className="eyebrow">ROLLUP INTEGRITY</p>
          <h2 id="integrity-title">Check the history against its source.</h2>
        </div>
        <span className={`integrity-status ${status}`}>
          {status === 'verified' ? (
            <ShieldCheck size={17} />
          ) : (
            <TriangleAlert size={17} />
          )}
          {labels[status]}
        </span>
      </div>
      {!integrity ? (
        <p className="integrity-description">
          {monitor || interrupted
            ? 'The source comparison is unavailable. Temperature monitoring continues independently.'
            : 'Waiting for the database comparison…'}
        </p>
      ) : (
        <>
          <p className="integrity-description">
            {status === 'stale'
              ? 'Showing the last comparison; a fresh database check is needed.'
              : mismatches
                ? `${mismatches} zone buckets differ from raw readings. History and thermal debt may change after an aggregate refresh.`
                : gaps
                  ? 'The summaries match their source. Missing sensor samples still leave gaps in the temperature history.'
                  : 'Sample counts, sensor counts, mean temperatures and peaks agree with the raw readings in this window.'}
          </p>
          <dl className="integrity-metrics">
            <div>
              <dt>Zone buckets checked</dt>
              <dd>
                72 <span>/ 72</span>
              </dd>
            </div>
            <div>
              <dt>Different from source</dt>
              <dd className={mismatches ? 'gap-value' : ''}>{mismatches}</dd>
            </div>
            <div>
              <dt>Incomplete in source</dt>
              <dd className={gaps ? 'gap-value' : ''}>{gaps}</dd>
            </div>
            <div>
              <dt>Checked window · UTC</dt>
              <dd className="integrity-window">
                {timeLabel(integrity.windowStart)}–
                {timeLabel(integrity.windowEnd)}
              </dd>
            </div>
          </dl>
          <details className="integrity-details">
            <summary>
              <Database size={16} /> Zone comparison and refresh status
            </summary>
            <div className="integrity-table-wrap">
              <table>
                <caption>
                  12 five-minute buckets per zone ·{' '}
                  {new Date(integrity.windowStart).toISOString().slice(0, 10)}{' '}
                  UTC
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Zone</th>
                    <th scope="col">Raw / rollup samples</th>
                    <th scope="col">Different buckets</th>
                    <th scope="col">Incomplete source</th>
                  </tr>
                </thead>
                <tbody>
                  {integrity.zones.map((z) => (
                    <tr key={z.zoneId}>
                      <th scope="row">
                        <button onClick={() => onSelect(z.zoneId)}>
                          {z.zoneId} ·{' '}
                          {ZONES.find((known) => known.id === z.zoneId)?.name}
                        </button>
                      </th>
                      <td>
                        {z.rawSamples} / {z.rollupSamples}
                      </td>
                      <td>
                        {z.mismatchedBuckets}
                        {z.firstMismatchAt && (
                          <small>
                            First: {timeLabel(z.firstMismatchAt)} UTC
                          </small>
                        )}
                      </td>
                      <td>{z.incompleteRawBuckets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="integrity-refresh">
              Refresh job:{' '}
              <strong>
                {!refresh
                  ? 'unavailable'
                  : !refresh.scheduled
                    ? 'paused'
                    : (refresh.lastStatus ?? 'awaiting first run')}
              </strong>
              {refresh?.lastFinishedAt && (
                <> · Last success {timeLabel(refresh.lastFinishedAt)} UTC</>
              )}
              {refresh?.scheduled && refresh.nextStart && (
                <> · Next scheduled {timeLabel(refresh.nextStart)} UTC</>
              )}
            </p>
            <p className="integrity-description">
              Real-time aggregates include the newest readings. Late arrivals or
              corrections to already-materialized buckets need a refresh. This
              check compares one hour of history, with a ten-minute allowance
              for the refresh schedule. Gaps and differences can overlap;
              matching gaps do not mean complete coverage.
            </p>
            <a
              className="integrity-docs"
              href="https://www.tigerdata.com/docs/learn/continuous-aggregates/real-time-aggregates#real-time-aggregates-and-refreshing-historical-data"
              target="_blank"
              rel="noreferrer"
            >
              How Tiger handles late readings ↗
            </a>
          </details>
          <p className="integrity-stamp">
            Database check{' '}
            {new Date(monitor!.queriedAt)
              .toISOString()
              .replace('T', ' ')
              .slice(0, 19)}{' '}
            UTC · Updates every 30 seconds
          </p>
        </>
      )}
    </section>
  );
}
