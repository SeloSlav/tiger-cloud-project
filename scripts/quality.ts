import assert from 'node:assert/strict';

export function assertQuality(value: unknown) {
  assert.ok(value && typeof value === 'object', 'Missing SQL quality report');
  for (const key of [
    'duplicateSensorBuckets',
    'unexpectedSensors',
    'invalidZoneConfiguration',
  ]) {
    assert.equal(
      (value as Record<string, unknown>)[key],
      0,
      `Export aborted: ${key}. Run db:verify:mcp before publishing.`,
    );
  }
}
