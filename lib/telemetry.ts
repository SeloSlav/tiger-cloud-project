export const ZONES = [
  { id: 'A1', name: 'Fish store', cargo: 'Salmon & tuna', x: -6.2, z: -3.5 },
  {
    id: 'A2',
    name: 'Vegetable prep',
    cargo: 'Cucumber & avocado',
    x: -6.2,
    z: 3.5,
  },
  {
    id: 'B1',
    name: 'Fish preparation',
    cargo: 'Portioned salmon',
    x: 0,
    z: -3.5,
  },
  {
    id: 'B2',
    name: 'Maki assembly',
    cargo: 'Salmon-avocado rolls',
    x: 0,
    z: 3.5,
  },
  {
    id: 'C1',
    name: 'Nigiri assembly',
    cargo: 'Salmon nigiri',
    x: 6.2,
    z: -3.5,
  },
  {
    id: 'C2',
    name: 'Packing line',
    cargo: 'Chilled sushi trays',
    x: 6.2,
    z: 3.5,
  },
] as const;
export type ZoneId = (typeof ZONES)[number]['id'];
export type Metric = 'temperature' | 'debt';
export type Point = {
  time: string;
  temperature: number | null;
  sensors: number;
};
export type Snapshot = {
  version: 1;
  source: 'tiger' | 'fixture';
  generatedAt: string;
  intervalMinutes: number;
  rawReadings: number;
  engine: string;
  zones: Record<ZoneId, Point[]>;
  sqlDebt?: Record<ZoneId, number>;
};
export const LIMIT = 5;
export const INTERVAL = 5;
export const START = '2026-09-04T00:00:00.000Z';
export const EVENTS = [
  {
    index: 192,
    time: '16:00',
    title: 'Packing chiller pauses',
    detail: 'The packing line begins its temperature excursion.',
    zone: 'C2' as ZoneId,
  },
  {
    index: 213,
    time: '17:45',
    title: 'Maki line warms',
    detail: 'Assembly remains warm as the packing line recovers.',
    zone: 'B2' as ZoneId,
  },
  {
    index: 248,
    time: '20:40',
    title: 'Cooling restored',
    detail: 'Both lines return to range. The shift exposure is recorded.',
    zone: 'B2' as ZoneId,
  },
];
const rounded = (v: number) => Math.round(v * 100) / 100;
export function makeReadings() {
  const rows: {
    time: string;
    zone: string;
    sensor: string;
    temperature: number;
  }[] = [];
  for (let i = 0; i < 288; i++)
    for (const [j, zone] of ZONES.entries())
      for (let sensor = 0; sensor < 4; sensor++) {
        // Reproducible maintenance gap: no invented zeroes or interpolation.
        if (zone.id === 'C1' && i >= 100 && i < 105) continue;
        const pulse = (start: number, end: number, height: number) =>
          i < start || i > end
            ? 0
            : height * Math.sin((Math.PI * (i - start)) / (end - start));
        let temp =
          3.35 +
          j * 0.075 +
          0.24 * Math.sin(i * 0.21 + j) +
          (sensor - 1.5) * 0.09;
        if (zone.id === 'C2') temp += pulse(192, 227, 5.1);
        if (zone.id === 'B2') temp += pulse(202, 248, 4.9);
        if (zone.id === 'A2') temp += pulse(73, 90, 2.2);
        rows.push({
          time: new Date(Date.parse(START) + i * 300000).toISOString(),
          zone: zone.id,
          sensor: `${zone.id}-${sensor + 1}`,
          temperature: rounded(temp),
        });
      }
  return rows;
}
export function makeFixture(): Snapshot {
  const rows = makeReadings();
  const zones = {} as Snapshot['zones'];
  for (const zone of ZONES)
    zones[zone.id] = Array.from({ length: 288 }, (_, i) => {
      const time = new Date(Date.parse(START) + i * 300000).toISOString();
      const samples = rows.filter((r) => r.zone === zone.id && r.time === time);
      return {
        time,
        temperature: samples.length
          ? rounded(
              samples.reduce((n, r) => n + r.temperature, 0) / samples.length,
            )
          : null,
        sensors: samples.length,
      };
    });
  return {
    version: 1,
    source: 'fixture',
    generatedAt: START,
    intervalMinutes: INTERVAL,
    rawReadings: rows.length,
    engine: 'Deterministic local fixture',
    zones,
  };
}
// Each value describes a completed five-minute bucket. Count only observed,
// complete buckets; gaps remain unknown and never imply normal conditions.
export function summarize(points: Point[], index: number) {
  let debt = 0,
    aboveMinutes = 0,
    observedMinutes = 0,
    peak: number | null = null;
  const upto = Math.max(-1, Math.min(Math.trunc(index), points.length - 1));
  for (let i = 0; i <= upto; i++) {
    const point = points[i];
    if (point.temperature === null || point.sensors !== 4) continue;
    observedMinutes += INTERVAL;
    peak =
      peak === null ? point.temperature : Math.max(peak, point.temperature);
    if (point.temperature > LIMIT) {
      debt += (point.temperature - LIMIT) * INTERVAL;
      aboveMinutes += INTERVAL;
    }
  }
  const point = points[upto];
  const temperature = point && point.sensors === 4 ? point.temperature : null;
  return {
    temperature,
    debt: rounded(debt),
    aboveMinutes,
    observedMinutes,
    unknownMinutes: (upto + 1) * INTERVAL - observedMinutes,
    peak,
    sensors: point?.sensors ?? 0,
  };
}
export function colorFor(
  temperature: number | null,
  debt: number,
  metric: Metric,
) {
  if (temperature === null) return '#77858f';
  const value = metric === 'temperature' ? temperature : debt;
  if (value > (metric === 'temperature' ? 7 : 150)) return '#f28d6c';
  if (value > (metric === 'temperature' ? 5 : 0)) return '#e5bd74';
  return '#73cbb9';
}
export function timeLabel(time: string, end = false) {
  const label = new Date(Date.parse(time) + (end ? INTERVAL * 60000 : 0))
    .toISOString()
    .slice(11, 16);
  return end && label === '00:00' ? '24:00' : label;
}
