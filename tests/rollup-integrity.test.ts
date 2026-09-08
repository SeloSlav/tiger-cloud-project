import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ZONES } from '../lib/telemetry';
import {
  parseIntegrity,
  integrityStatus,
  type RollupIntegrity,
} from '../lib/rollup-integrity';
import { RollupIntegrityPanel } from '../components/rollup-integrity';
import type { LiveMonitor } from '../lib/live-monitor';

const queriedAt = '2026-09-08T10:02:00Z';
const now = Date.parse(queriedAt);
function fixture(): RollupIntegrity {
  return {
    windowStart: '2026-09-08T08:50:00Z',
    windowEnd: '2026-09-08T09:50:00Z',
    graceMinutes: 10,
    zones: ZONES.map((z) => ({
      zoneId: z.id,
      checkedBuckets: 12,
      mismatchedBuckets: 0,
      incompleteRawBuckets: 0,
      rawSamples: 240,
      rollupSamples: 240,
      firstMismatchAt: null,
    })),
    refresh: {
      scheduled: true,
      lastStatus: 'Success',
      lastFinishedAt: queriedAt,
      nextStart: null,
    },
  };
}
void test('matching source gaps are not reported as aggregate drift or full coverage', () => {
  const r = fixture();
  r.zones[4].incompleteRawBuckets = 2;
  r.zones[4].rawSamples = r.zones[4].rollupSamples = 235;
  assert.equal(parseIntegrity(r, queriedAt), r);
  assert.equal(integrityStatus(r, queriedAt, now, false), 'gaps');
});
void test('drift takes precedence over missing source samples and successful refresh jobs', () => {
  const r = fixture();
  Object.assign(r.zones[0], {
    mismatchedBuckets: 1,
    incompleteRawBuckets: 1,
    firstMismatchAt: r.windowStart,
  });
  assert.equal(parseIntegrity(r, queriedAt), r);
  assert.equal(integrityStatus(r, queriedAt, now, false), 'drift');
});
void test('an old or interrupted check never remains verified', () => {
  const r = fixture();
  assert.equal(integrityStatus(r, queriedAt, now, false), 'verified');
  assert.equal(integrityStatus(r, queriedAt, now + 90001, false), 'stale');
  assert.equal(integrityStatus(r, queriedAt, now, true), 'stale');
  assert.equal(
    integrityStatus(undefined, queriedAt, now, false),
    'unavailable',
  );
});
void test('rejects mismatched windows, duplicated zones, impossible counts and out-of-window drift', () => {
  for (const corrupt of [
    (r: RollupIntegrity) => {
      r.windowEnd = '2026-09-08T09:55:00Z';
    },
    (r: RollupIntegrity) => {
      r.zones[1].zoneId = r.zones[0].zoneId;
    },
    (r: RollupIntegrity) => {
      r.zones[0].rawSamples = 241;
    },
    (r: RollupIntegrity) => {
      r.zones[0].mismatchedBuckets = 13;
    },
    (r: RollupIntegrity) => {
      r.zones[0].mismatchedBuckets = 1;
      r.zones[0].firstMismatchAt = r.windowEnd;
    },
  ]) {
    const r = fixture();
    corrupt(r);
    assert.throws(
      () => parseIntegrity(r, queriedAt),
      /Invalid rollup integrity/,
    );
  }
});
void test('paused refresh with no next execution is valid', () => {
  const r = fixture();
  r.refresh!.scheduled = false;
  assert.equal(parseIntegrity(r, queriedAt), r);
});
void test('the panel renders missing, healthy, incomplete, drift and interrupted states', () => {
  const render = (integrity?: RollupIntegrity, interrupted = false) =>
    renderToStaticMarkup(
      createElement(RollupIntegrityPanel, {
        monitor: { queriedAt, integrity } as LiveMonitor,
        now,
        interrupted,
        onSelect: () => {},
      }),
    );
  assert.match(render(), /Check unavailable/);
  const r = fixture();
  assert.match(render(r), /All buckets match/);
  r.zones[0].incompleteRawBuckets = 1;
  assert.match(render(r), /Source has gaps/);
  r.zones[0].mismatchedBuckets = 1;
  r.zones[0].firstMismatchAt = r.windowStart;
  assert.match(render(r), /History differs/);
  assert.match(render(r, true), /Check out of date/);
});
