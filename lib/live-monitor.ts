import { ZONES, summarize, type Snapshot, type ZoneId } from './telemetry';

export type LiveMonitor = {
  version: 1;
  queriedAt: string;
  latestReadingAt: string | null;
  current: Record<
    ZoneId,
    { temperature: number | null; sensors: number; lastSeen: string | null }
  >;
  history: Snapshot;
  incidents: {
    id: string;
    zoneId: ZoneId;
    startedAt: string;
    confirmedAt: string;
    resolvedAt: string | null;
    lastObservedAt: string;
    peakTemperature: number;
  }[];
  collector: {
    scheduled: boolean;
    lastStatus: string | null;
    lastFinishedAt: string | null;
  } | null;
};
export function parseMonitor(value: unknown): LiveMonitor {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid monitor response');
  const m = value as LiveMonitor;
  if (
    m.version !== 1 ||
    !Number.isFinite(Date.parse(m.queriedAt)) ||
    m.history?.source !== 'tiger' ||
    m.history?.intervalMinutes !== 5 ||
    !Array.isArray(m.incidents) ||
    m.incidents.length > 20 ||
    !Number.isSafeInteger(m.history.rawReadings) ||
    m.history.rawReadings < 0 ||
    typeof m.history.engine !== 'string' ||
    !Number.isFinite(Date.parse(m.history.generatedAt)) ||
    (m.latestReadingAt !== null &&
      !Number.isFinite(Date.parse(m.latestReadingAt)))
  )
    throw new Error('Invalid monitor response');
  for (const z of ZONES) {
    const points = m.history.zones?.[z.id],
      current = m.current?.[z.id];
    if (
      !current ||
      !points ||
      points.length !== 288 ||
      !Number.isInteger(current.sensors) ||
      current.sensors < 0 ||
      current.sensors > 4 ||
      (current.temperature !== null && !Number.isFinite(current.temperature)) ||
      (current.lastSeen !== null &&
        !Number.isFinite(Date.parse(current.lastSeen)))
    )
      throw new Error('Invalid zone readings');
    for (const [i, p] of points.entries()) {
      if (
        !Number.isFinite(Date.parse(p.time)) ||
        ![0, 4].includes(p.sensors) ||
        (p.temperature !== null &&
          (!Number.isFinite(p.temperature) || p.sensors !== 4)) ||
        (i > 0 &&
          Date.parse(p.time) - Date.parse(points[i - 1].time) !== 300000)
      )
        throw new Error('Invalid history');
    }
    const sqlDebt = m.history.sqlDebt?.[z.id];
    if (
      typeof sqlDebt !== 'number' ||
      !Number.isFinite(sqlDebt) ||
      Math.abs(summarize(points, 287).debt - sqlDebt) > 0.011
    )
      throw new Error('SQL exposure verification failed');
  }
  for (const incident of m.incidents) {
    if (
      !ZONES.some((z) => z.id === incident.zoneId) ||
      typeof incident.id !== 'string' ||
      !Number.isFinite(incident.peakTemperature) ||
      ![
        incident.startedAt,
        incident.confirmedAt,
        incident.lastObservedAt,
      ].every((t) => Number.isFinite(Date.parse(t))) ||
      (incident.resolvedAt !== null &&
        !Number.isFinite(Date.parse(incident.resolvedAt)))
    )
      throw new Error('Invalid incident');
  }
  return m;
}
export function monitorIsStale(m: LiveMonitor | null, now: number) {
  return (
    !m?.latestReadingAt ||
    !Number.isFinite(Date.parse(m.latestReadingAt)) ||
    now - Date.parse(m.latestReadingAt) > 180000
  );
}
export function emptyLiveHistory(): Snapshot {
  // Only unknown placeholders until the first database response, never archive
  // values presented as live measurements. Fixed start also avoids hydration drift.
  const zones = {} as Snapshot['zones'];
  for (const z of ZONES)
    zones[z.id] = Array.from({ length: 288 }, (_, i) => ({
      time: new Date(Date.UTC(2026, 8, 4) + i * 300000).toISOString(),
      temperature: null,
      sensors: 0,
    }));
  return {
    version: 1,
    source: 'tiger',
    generatedAt: '2026-09-04T00:00:00Z',
    intervalMinutes: 5,
    rawReadings: 0,
    engine: 'TimescaleDB',
    zones,
  };
}
