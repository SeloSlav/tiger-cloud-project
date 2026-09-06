import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeFixture,
  summarize,
  colorFor,
  ZONES,
  EVENTS,
  timeLabel,
  type Point,
} from '../lib/telemetry';
const point = (temperature: number | null, sensors = 4): Point => ({
  time: '2026-09-04T00:00:00Z',
  temperature,
  sensors,
});
void test('degree-minutes include magnitude and duration, with an exclusive limit', () => {
  const result = summarize([point(4), point(5), point(7), point(8)], 3);
  assert.equal(result.debt, 25);
  assert.equal(result.aboveMinutes, 10);
});
void test('replay never includes future exposure', () => {
  assert.equal(summarize([point(4), point(10)], 0).debt, 0);
});
void test('missing and partial buckets remain unknown and do not inflate exposure', () => {
  const result = summarize(
    [point(7), point(null, 0), point(9, 3), point(3)],
    3,
  );
  assert.equal(result.debt, 10);
  assert.equal(result.unknownMinutes, 10);
  assert.equal(result.observedMinutes, 10);
});
void test('a recovered zone keeps historical exposure', () => {
  const result = summarize([point(9), point(3)], 1);
  assert.equal(result.temperature, 3);
  assert.equal(result.debt, 20);
});
void test('fixture is deterministic, complete in time, and has a deliberate gap', () => {
  const fixture = makeFixture();
  assert.deepEqual(fixture, makeFixture());
  assert.equal(fixture.rawReadings, 6892);
  for (const zone of ZONES) assert.equal(fixture.zones[zone.id].length, 288);
  assert.equal(summarize(fixture.zones.C1, 287).unknownMinutes, 25);
  assert.ok(summarize(fixture.zones.B2, 222).temperature! > 5);
  assert.ok(summarize(fixture.zones.B2, 287).temperature! < 5);
  assert.ok(summarize(fixture.zones.B2, 287).debt > 150);
});
void test('color thresholds use the selected metric and mark missing data', () => {
  assert.equal(colorFor(3, 200, 'temperature'), '#73cbb9');
  assert.equal(colorFor(3, 200, 'debt'), '#f28d6c');
  assert.equal(colorFor(null, 0, 'temperature'), '#77858f');
});
void test('completed bucket labels distinguish the end of a shift from its start', () => {
  assert.equal(timeLabel('2026-09-04T00:00:00Z'), '00:00');
  assert.equal(timeLabel('2026-09-04T00:00:00Z', true), '00:05');
  assert.equal(timeLabel('2026-09-04T23:55:00Z', true), '24:00');
});
void test('cooling-restored event matches recovered temperatures on both affected lines', () => {
  const snapshot = makeFixture();
  for (const id of ['B2', 'C2'] as const) {
    const state = summarize(snapshot.zones[id], EVENTS[2].index);
    assert.ok(state.temperature! <= 5);
    assert.ok(state.debt > 0);
  }
});
