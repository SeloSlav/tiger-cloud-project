export type FloorPoint = readonly [number, number];
export type Point3 = readonly [number, number, number];
export type Pose = { position: Point3; heading: number };
export type Dock = { point: FloorPoint; position: Point3; heading: number };
export type Product = 'maki' | 'nigiri' | 'vegetables';
export type Action = {
  start: number;
  end: number;
  kind: 'walk' | 'turn' | 'pickup' | 'dropoff' | 'work' | 'wait';
  from: Pose;
  to: Pose;
  carrying: boolean;
  dock?: Dock;
};
export const MOTION = {
  speed: 1.55,
  handling: 0.85,
  turnSpeed: 4,
  demoRate: 1.65,
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
export const modulo = (n: number, d: number) => ((n % d) + d) % d;
export const headingMix = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const pose = (p: FloorPoint, heading: number): Pose => ({
  position: [p[0], 0.09, p[1]],
  heading,
});
const dock = (x: number, z: number, heading = Math.PI, y = 1.34): Dock => ({
  point: [x, z],
  position: [x + Math.sin(heading) * 0.57, y, z + Math.cos(heading) * 0.57],
  heading,
});
export const DOCKS = {
  rawMaki: dock(-7.6, -3.45),
  rawNigiri: dock(-4.8, -3.45),
  prepMaki: dock(-1.05, -3.6),
  prepNigiri: dock(1.05, -3.6),
  maki: dock(-0.75, 3.4),
  nigiri: dock(6.2, -3.6),
  packMaki: dock(5.05, 3.55, 0, 1.31),
  packNigiri: dock(7.35, 3.55, 0, 1.31),
  chilledMaki: dock(4.45, 3.4),
  chilledNigiri: dock(5.4, 3.4, Math.PI, 1.74),
  vegetables: dock(-6.2, 3.4),
  vegetableSupply: dock(0.9, 3.4),
  vegCrates: dock(-7.5, 3.8, 0),
  vegPrep: dock(-4.9, 3.4),
};
export function held(point: FloorPoint, heading: number): Pose {
  return {
    position: [
      point[0] + Math.sin(heading) * 0.43,
      1.48,
      point[1] + Math.cos(heading) * 0.43,
    ],
    heading,
  };
}
export const routeLength = (points: readonly FloorPoint[]) =>
  points
    .slice(1)
    .reduce(
      (n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );
const row = (z: number) =>
  [-6.9, -3.4, 0, 3.55, 6.9].reduce((a, b) =>
    Math.abs(z - a) < Math.abs(z - b) ? a : b,
  );
// Directional lanes replace the factory-wide lock. Outside aisles connect all
// work positions without shortcuts through tables or refrigerators.
export function aisleRoute(from: FloorPoint, to: FloorPoint): FloorPoint[] {
  const a = row(from[1]),
    b = row(to[1]);
  const east = to[0] >= from[0];
  const az = a + (east ? -0.25 : 0.25),
    bz = b + (east ? -0.25 : 0.25);
  const p: FloorPoint[] = [from, [from[0], az]];
  if (a !== b) {
    const x =
      [-9.3, -3.1, 3.1, 9.3].reduce((best, n) =>
        Math.abs(from[0] - n) + Math.abs(to[0] - n) <
        Math.abs(from[0] - best) + Math.abs(to[0] - best)
          ? n
          : best,
      ) + (b > a ? -0.25 : 0.25);
    p.push([x, az], [x, bz]);
  }
  p.push([to[0], bz], to);
  return p.filter(
    (v, i) => !i || Math.hypot(v[0] - p[i - 1][0], v[1] - p[i - 1][1]) > 0.001,
  );
}
type RouteInput = {
  id: string;
  product: Product;
  stage: number;
  source: Dock;
  destination: Dock;
  home: FloorPoint;
  work: number;
  phase: number;
};
export type ProductionRoute = RouteInput & {
  actions: Action[];
  duration: number;
  pickup: number;
  dropoff: number;
  workStart: number;
  workEnd: number;
  returnedAt?: number;
};
function makeRoute(input: RouteInput): ProductionRoute {
  const actions: Action[] = [];
  let at = pose(input.home, 0),
    time = 0;
  const add = (
    kind: Action['kind'],
    to: Pose,
    duration: number,
    carrying = false,
    dock?: Dock,
  ) => {
    actions.push({
      kind,
      from: at,
      to,
      start: time,
      end: time + duration,
      carrying,
      dock,
    });
    time += duration;
    at = to;
  };
  function face(heading: number, carrying: boolean) {
    const angle = Math.abs(headingMix(at.heading, heading, 1) - at.heading);
    if (angle > 0.001)
      add(
        'turn',
        { ...at, heading },
        Math.max(0.15, angle / MOTION.turnSpeed),
        carrying,
      );
  }
  function walk(to: FloorPoint, heading: number, carrying = false) {
    const points = aisleRoute([at.position[0], at.position[2]], to);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      face(yaw, carrying);
      add('walk', pose(b, yaw), routeLength([a, b]) / MOTION.speed, carrying);
    }
    face(heading, carrying);
  }
  walk(input.source.point, input.source.heading);
  const workStart = time;
  if (input.work) add('work', at, input.work);
  const workEnd = time,
    pickup = time;
  add('pickup', at, MOTION.handling, false, input.source);
  walk(input.destination.point, input.destination.heading, true);
  add('dropoff', at, MOTION.handling, true, input.destination);
  const dropoff = time;
  let returnedAt: number | undefined;
  if (input.product === 'vegetables') {
    add('work', at, 2, false, input.destination);
    add('pickup', at, MOTION.handling, false, input.destination);
    walk(input.source.point, input.source.heading, true);
    add('dropoff', at, MOTION.handling, true, input.source);
    returnedAt = time;
  }
  walk(input.home, 0);
  return {
    ...input,
    actions,
    duration: time,
    pickup,
    dropoff,
    workStart,
    workEnd,
    returnedAt,
  };
}
const inputs: RouteInput[] = [];
for (const [product, raw, prep, assembly, pack, chilled, bias] of [
  [
    'maki',
    DOCKS.rawMaki,
    DOCKS.prepMaki,
    DOCKS.maki,
    DOCKS.packMaki,
    DOCKS.chilledMaki,
    0,
  ],
  [
    'nigiri',
    DOCKS.rawNigiri,
    DOCKS.prepNigiri,
    DOCKS.nigiri,
    DOCKS.packNigiri,
    DOCKS.chilledNigiri,
    1,
  ],
] as const) {
  const incoming = dock(13.4, -6.6 - bias * 0.8, 0),
    outgoing = dock(13.4, 6.6 + bias * 0.8, 0);
  const stations = [incoming, raw, prep, assembly, pack, chilled, outgoing];
  const homes: FloorPoint[] = bias
    ? [
        [12.5, -7.4],
        [-5.2, 0.65],
        [1.8, 0.65],
        [6.4, -0.65],
        [7.5, 6.4],
        [10.3, 0.65],
      ]
    : [
        [12.5, -6.2],
        [-7.7, 0.65],
        [-1.6, 0.65],
        [-1.2, 6.4],
        [5.1, 6.4],
        [10.3, 6.4],
      ];
  for (let stage = 0; stage < 6; stage++)
    inputs.push({
      id: `${product}-${stage}`,
      product,
      stage,
      source: stations[stage],
      destination: stations[stage + 1],
      home: homes[stage],
      work: [0, 1.5, 3.5, 5, 4, 0][stage],
      phase: [0, 7, 16, 2, 24, 12][stage] + bias * 15,
    });
}
inputs.push(
  {
    id: 'vegetables-0',
    product: 'vegetables',
    stage: 0,
    source: DOCKS.vegCrates,
    destination: DOCKS.vegPrep,
    home: [-7.6, 6.4],
    work: 3,
    phase: 4,
  },
  {
    id: 'vegetables-1',
    product: 'vegetables',
    stage: 1,
    source: DOCKS.vegetables,
    destination: DOCKS.vegetableSupply,
    home: [-5.2, 6.4],
    work: 4,
    phase: 25,
  },
);
export const PRODUCTION_ROUTES = inputs.map(makeRoute);
export const PRODUCTION_PERIOD = Math.ceil(
  Math.max(...PRODUCTION_ROUTES.map((r) => r.duration)) + 2,
);
export const DEMO_START = 21;
export function sampleRoute(route: ProductionRoute, seconds: number) {
  const time = modulo(seconds - route.phase, PRODUCTION_PERIOD);
  const action = route.actions.find((a) => time >= a.start && time < a.end);
  const progress = action
    ? (time - action.start) / (action.end - action.start)
    : 0;
  const result: Pose = action
    ? {
        position: action.from.position.map((n, i) =>
          mix(
            n,
            action.to.position[i],
            action.kind === 'walk' ? progress : ease(progress),
          ),
        ) as unknown as Point3,
        heading: headingMix(
          action.from.heading,
          action.to.heading,
          ease(progress),
        ),
      }
    : pose(route.home, 0);
  const carrying = action?.carrying || action?.kind === 'pickup';
  let cargo: Pose | undefined;
  if (carrying) {
    cargo = held([result.position[0], result.position[2]], result.heading);
    if (action?.kind === 'pickup' || action?.kind === 'dropoff') {
      const lifting = action.kind === 'pickup';
      const dockPose =
        action.dock ?? (lifting ? route.source : route.destination);
      const from = lifting
        ? { position: dockPose.position, heading: dockPose.heading }
        : cargo;
      const to = lifting
        ? cargo
        : { position: dockPose.position, heading: dockPose.heading };
      const t = Math.max(0, Math.min(1, (progress - 0.2) / 0.6));
      cargo = {
        position: from.position.map(
          (n, i) =>
            mix(n, to.position[i], ease(t)) +
            (i === 1 ? Math.sin(t * Math.PI) * 0.12 : 0),
        ) as unknown as Point3,
        heading: headingMix(from.heading, to.heading, ease(t)),
      };
    }
  }
  return {
    ...result,
    action,
    progress,
    cargo,
    time,
    walking: action?.kind === 'walk',
    visible: result.position[0] < 11.9,
  };
}
// Stagger whole crew cycles, not the entire factory. A deterministic phase
// search minimizes encounters in the shared aisle crossings while preserving
// each worker's continuous route and every subsequent batch dependency.
function staggerCrews() {
  const steps = PRODUCTION_PERIOD * 4;
  const samples = PRODUCTION_ROUTES.map((route) =>
    Array.from(
      { length: steps },
      (_, i) => sampleRoute(route, i / 4 + route.phase).position,
    ),
  );
  const pairCosts = PRODUCTION_ROUTES.map((_, i) =>
    PRODUCTION_ROUTES.map((__, j) => {
      if (i >= j) return new Float64Array(0);
      return Float64Array.from({ length: steps }, (___, shift) => {
        let cost = 0;
        for (let t = 0; t < steps; t++) {
          const a = samples[i][t],
            b = samples[j][(t + shift) % steps];
          if (a[0] > 11.9 || b[0] > 11.9) continue;
          const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
          if (d < 0.58) cost += (0.58 - d) ** 2;
        }
        return cost;
      });
    }),
  );
  const phases = PRODUCTION_ROUTES.map((r) => Math.round(r.phase * 4) % steps);
  for (let pass = 0; pass < 12; pass++)
    for (let i = 0; i < phases.length; i++) {
      let best = phases[i],
        lowest = Infinity;
      for (let candidate = 0; candidate < steps; candidate++) {
        let score = 0;
        for (let j = 0; j < phases.length; j++) {
          if (i < j)
            score += pairCosts[i][j][modulo(candidate - phases[j], steps)];
          if (i > j)
            score += pairCosts[j][i][modulo(phases[j] - candidate, steps)];
        }
        if (score < lowest) {
          best = candidate;
          lowest = score;
        }
      }
      phases[i] = best;
    }
  phases.forEach((p, i) => {
    PRODUCTION_ROUTES[i].phase = p / 4;
  });
}
staggerCrews();
export type BatchFlow = {
  product: Product;
  routes: ProductionRoute[];
  starts: number[];
  slots: number;
  period: number;
};
function makeFlow(product: Product): BatchFlow {
  const routes = PRODUCTION_ROUTES.filter((r) => r.product === product);
  const starts: number[] = [];
  routes.forEach((route, i) => {
    let start = route.phase;
    if (i) {
      const previous = routes[i - 1];
      const available = starts[i - 1] + previous.dropoff + 0.25;
      while (start + route.workStart < available) start += PRODUCTION_PERIOD;
    }
    starts.push(start);
  });
  const slots =
    Math.ceil(
      (starts.at(-1)! + routes.at(-1)!.dropoff + 1) / PRODUCTION_PERIOD,
    ) + 1;
  return { product, routes, starts, slots, period: slots * PRODUCTION_PERIOD };
}
export const BATCH_FLOWS = (['maki', 'nigiri'] as const).map(makeFlow);
export function sampleBatch(flow: BatchFlow, slot: number, seconds: number) {
  const age = modulo(seconds - slot * PRODUCTION_PERIOD, flow.period);
  let result: Pose = {
    position: flow.routes[0].source.position,
    heading: flow.routes[0].source.heading,
  };
  let owner: ProductionRoute | undefined,
    stage = 0,
    work = 0;
  for (let i = 0; i < flow.routes.length; i++) {
    const route = flow.routes[i],
      local = age - flow.starts[i];
    if (local < route.workStart) break;
    stage = i;
    work = route.work ? ease((local - route.workStart) / route.work) : 1;
    if (local >= route.pickup && local < route.dropoff) {
      const state = sampleRoute(route, local + route.phase);
      result = state.cargo!;
      owner = route;
    } else if (local >= route.dropoff) {
      result = {
        position: route.destination.position,
        heading: route.destination.heading,
      };
      owner = undefined;
    }
  }
  return {
    ...result,
    owner,
    stage,
    work,
    age,
    visible: result.position[0] < 11.9,
  };
}
