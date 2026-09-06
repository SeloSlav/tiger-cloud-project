import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeFixture,
  summarize,
  colorFor,
  ZONES,
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
