import { ZONES, type ZoneId } from './telemetry';

export type RollupIntegrity = {
  windowStart: string;
  windowEnd: string;
  graceMinutes: 10;
  zones: {
    zoneId: ZoneId;
    checkedBuckets: number;
    mismatchedBuckets: number;
    incompleteRawBuckets: number;
    rawSamples: number;
    rollupSamples: number;
    firstMismatchAt: string | null;
  }[];
  refresh: {
    scheduled: boolean;
    lastStatus: string | null;
    lastFinishedAt: string | null;
    nextStart: string | null;
  } | null;
};

const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
const count = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

export function parseIntegrity(
  value: unknown,
  queriedAt: string,
): RollupIntegrity {
  const r = value as RollupIntegrity | null;
  if (
    !r ||
    !timestamp(r.windowStart) ||
    !timestamp(r.windowEnd) ||
    r.graceMinutes !== 10 ||
    Date.parse(r.windowEnd) - Date.parse(r.windowStart) !== 3600000 ||
    Date.parse(r.windowEnd) !==
      Math.floor(Date.parse(queriedAt) / 300000) * 300000 - 600000 ||
    !Array.isArray(r.zones) ||
    r.zones.length !== ZONES.length ||
    new Set(r.zones.map((z) => z?.zoneId)).size !== ZONES.length
  )
    throw new Error('Invalid rollup integrity');
  for (const z of r.zones) {
    if (
      !z ||
      !ZONES.some((known) => known.id === z.zoneId) ||
      z.checkedBuckets !== 12 ||
      !count(z.mismatchedBuckets, 12) ||
      !count(z.incompleteRawBuckets, 12) ||
      !count(z.rawSamples, 240) ||
      !count(z.rollupSamples, 240) ||
      (z.mismatchedBuckets === 0
        ? z.firstMismatchAt !== null
        : !timestamp(z.firstMismatchAt) ||
          Date.parse(z.firstMismatchAt) < Date.parse(r.windowStart) ||
          Date.parse(z.firstMismatchAt) >= Date.parse(r.windowEnd) ||
          Date.parse(z.firstMismatchAt) % 300000 !== 0)
    )
      throw new Error('Invalid rollup integrity');
  }
  if (
    r.refresh !== null &&
    (!r.refresh ||
      typeof r.refresh.scheduled !== 'boolean' ||
      (r.refresh.lastStatus !== null &&
        typeof r.refresh.lastStatus !== 'string') ||
      (r.refresh.lastFinishedAt !== null &&
        !timestamp(r.refresh.lastFinishedAt)) ||
      (r.refresh.nextStart !== null && !timestamp(r.refresh.nextStart)))
  )
    throw new Error('Invalid refresh status');
  return r;
}

export function integrityStatus(
  integrity: RollupIntegrity | undefined,
  queriedAt: string | undefined,
  now: number,
  interrupted: boolean,
) {
  if (!integrity) return 'unavailable';
  if (
    interrupted ||
    !queriedAt ||
    !timestamp(queriedAt) ||
    now - Date.parse(queriedAt) > 90000
  )
    return 'stale';
  if (integrity.zones.some((z) => z.mismatchedBuckets > 0)) return 'drift';
  if (integrity.zones.some((z) => z.incompleteRawBuckets > 0)) return 'gaps';
  return 'verified';
}
