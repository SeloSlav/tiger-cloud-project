import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, summarize, ZONES } from '../lib/telemetry';
import {
  parseMonitor,
  monitorIsStale,
  emptyLiveHistory,
  type LiveMonitor,
} from '../lib/live-monitor';

function monitor(): LiveMonitor {
  const history = makeFixture();
  history.source = 'tiger';
  history.sqlDebt = {} as NonNullable<typeof history.sqlDebt>;
  const current = {} as LiveMonitor['current'];
  for (const z of ZONES) {
    history.sqlDebt[z.id] = summarize(history.zones[z.id], 287).debt;
    current[z.id] = {
      temperature: 3.5,
      sensors: 4,
      lastSeen: '2026-09-04T23:59:00Z',
    };
  }
  return {
    version: 1,
    queriedAt: '2026-09-05T00:00:00Z',
    latestReadingAt: '2026-09-04T23:59:00Z',
    current,
    history,
    incidents: [],
    collector: {
      scheduled: true,
      lastStatus: 'Success',
      lastFinishedAt: '2026-09-04T23:59:01Z',
    },
  };
}
void test('live data validates SQL exposure against the chart calculation', () => {
  const m = monitor();
  assert.equal(parseMonitor(m), m);
  m.history.sqlDebt!.B2 += 5;
  assert.throws(() => parseMonitor(m), /SQL exposure/);
});
void test('a duplicated or reordered history timestamp is rejected', () => {
  const m = monitor();
  m.history.zones.A1[1].time = m.history.zones.A1[0].time;
  assert.throws(() => parseMonitor(m), /Invalid history/);
});
void test('staleness follows sensor time rather than the HTTP response time', () => {
  const m = monitor();
  assert.equal(monitorIsStale(m, Date.parse('2026-09-05T00:00:00Z')), false);
  m.queriedAt = '2026-09-05T00:04:00Z';
  assert.equal(monitorIsStale(m, Date.parse(m.queriedAt)), true);
  assert.equal(monitorIsStale(null, Date.now()), true);
});
void test('the disconnected initial view contains no invented measurements', () => {
  const history = emptyLiveHistory();
  for (const zone of ZONES)
    assert.equal(summarize(history.zones[zone.id], 287).unknownMinutes, 1440);
});
