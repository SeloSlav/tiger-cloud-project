export type FloorPoint = readonly [number, number];
export type Point3 = readonly [number, number, number];
export type WorkerId =
  | 'store'
  | 'vegetables'
  | 'prep'
  | 'maki'
  | 'nigiri'
  | 'packing';
export type Pose = { position: Point3; heading: number };
export type Dock = { point: FloorPoint; heading: number; position: Point3 };
export type Action = {
  worker: WorkerId;
  label: string;
  start: number;
  end: number;
  kind: 'walk' | 'turn' | 'transfer' | 'work';
  from: Pose;
  to: Pose;
  object?: string;
};
export const MOTION = { speed: 1.2, turn: 0.35, handling: 0.95, work: 2.8 };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
export const headingMix = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const pose = (point: FloorPoint, heading: number): Pose => ({
  position: [point[0], 0.09, point[1]],
  heading,
});
const dock = (x: number, z: number, heading = Math.PI, y = 1.34): Dock => ({
  point: [x, z],
  heading,
  position: [x + Math.sin(heading) * 0.57, y, z + Math.cos(heading) * 0.57],
});
export const DOCKS = {
  rawMaki: dock(-7.6, -3.4),
  rawNigiri: dock(-4.8, -3.4),
  prepMaki: dock(-1.05, -3.6),
  prepNigiri: dock(1.05, -3.6),
  vegetables: dock(-6.2, 3.4),
  maki: dock(-0.75, 3.4),
  makiVegetables: dock(0.9, 3.4),
  nigiri: dock(6.2, -3.6),
  packMaki: dock(5.05, 3.6, 0, 1.31),
  packNigiri: dock(7.35, 3.6, 0, 1.31),
  sealer: dock(7.42, 3.4, Math.PI, 1.43),
  chilledMaki: dock(4.9, 3.4),
  chilledNigiri: dock(4.9, 3.4, Math.PI, 1.74),
};
// Park on the opposite side of the bench aisle, clear of the delivery positions.
export const WORKER_HOME: Record<WorkerId, Dock> = {
  store: dock(-8.6, -3.05),
  vegetables: dock(-7.6, 3.95, 0),
  prep: dock(-1.7, -3.05, 0),
  maki: dock(-1.7, 3.95, 0),
  nigiri: dock(4.6, -3.05, 0),
  packing: dock(8.15, 3.85, 0),
};
export function routeLength(points: readonly FloorPoint[]) {
  return points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );
}
// All cross-row movement uses the open passages between production cells.
export function aisleRoute(from: FloorPoint, to: FloorPoint): FloorPoint[] {
  const fromRow = from[1] < 0 ? -3.65 : 3.4;
  const toRow = to[1] < 0 ? -3.65 : 3.4;
  const points: FloorPoint[] = [from, [from[0], fromRow]];
  if (Math.abs(from[1] - to[1]) > 1) {
    const lane = [-9.3, -3.1, 3.1, 9.3].reduce((best, x) =>
      Math.abs(from[0] - x) + Math.abs(to[0] - x) <
      Math.abs(from[0] - best) + Math.abs(to[0] - best)
        ? x
        : best,
    );
    points.push([lane, fromRow], [lane, toRow]);
  }
  points.push([to[0], toRow], to);
  return points.filter(
    (p, i) =>
      i === 0 ||
      Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.001,
  );
}
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
export function createProductionPlan() {
  const actions: Action[] = [];
  const initial: Record<string, Pose> = {};
  const ready = Object.fromEntries(
    Object.keys(WORKER_HOME).map((id) => [id, 0]),
  ) as Record<WorkerId, number>;
  const current = Object.fromEntries(
    Object.entries(WORKER_HOME).map(([id, d]) => [
      id,
      pose(d.point, d.heading),
    ]),
  ) as Record<WorkerId, Pose>;
  let aisleFree = 0;
  function add(
    worker: WorkerId,
    action: Omit<Action, 'worker' | 'start' | 'end'>,
    duration: number,
    after = 0,
  ) {
    const start = Math.max(ready[worker], after);
    const result = { ...action, worker, start, end: start + duration };
    actions.push(result);
    ready[worker] = result.end;
    return result.end;
  }
  function face(worker: WorkerId, heading: number, object?: string) {
    const from = current[worker],
      to = { ...from, heading };
    if (Math.abs(headingMix(from.heading, heading, 1) - from.heading) > 0.001)
      add(
        worker,
        { kind: 'turn', label: 'Turn toward work', from, to, object },
        Math.max(
          MOTION.turn,
          Math.abs(headingMix(from.heading, heading, 1) - from.heading) / 3,
        ),
      );
    current[worker] = to;
  }
  function walk(
    worker: WorkerId,
    destination: Dock,
    after = 0,
    object?: string,
  ) {
    const from = current[worker];
    const points = aisleRoute(
      [from.position[0], from.position[2]],
      destination.point,
    );
    ready[worker] = Math.max(ready[worker], after);
    if (routeLength(points) > 0) {
      // Reserve the narrow aisles, so transport workers yield at crossings.
      ready[worker] = Math.max(ready[worker], aisleFree);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        const heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
        face(worker, heading, object);
        const to = pose(b, heading);
        add(
          worker,
          {
            kind: 'walk',
            label: object ? 'Carry to next station' : 'Walk empty-handed',
            from: current[worker],
            to,
            object,
          },
          routeLength([a, b]) / MOTION.speed,
        );
        current[worker] = to;
      }
      face(worker, destination.heading, object);
      aisleFree = ready[worker];
    } else face(worker, destination.heading, object);
  }
  function transfer(
    worker: WorkerId,
    object: string,
    from: Pose,
    to: Pose,
    label: string,
  ) {
    return add(
      worker,
      { kind: 'transfer', label, from, to, object },
      MOTION.handling,
    );
  }
  function carry(
    worker: WorkerId,
    object: string,
    source: Dock,
    destination: Dock,
    after: number,
  ) {
    walk(worker, source, after);
    transfer(
      worker,
      object,
      { position: source.position, heading: source.heading },
      held(source.point, source.heading),
      'Pick up',
    );
    walk(worker, destination, 0, object);
    return transfer(
      worker,
      object,
      held(destination.point, destination.heading),
      { position: destination.position, heading: destination.heading },
      'Place on station',
    );
  }
  function work(
    worker: WorkerId,
    at: Dock,
    object: string,
    after: number,
    label: string,
  ) {
    walk(worker, at, after);
    return add(
      worker,
      {
        kind: 'work',
        label,
        from: current[worker],
        to: current[worker],
        object,
      },
      MOTION.work,
    );
  }
  for (const [id, at] of [
    ['maki-tray', DOCKS.rawMaki],
    ['nigiri-tray', DOCKS.rawNigiri],
    ['vegetable-tray', DOCKS.vegetables],
  ] as const)
    initial[id] = { position: at.position, heading: at.heading };
  for (const [tray, at] of [
    ['maki-tray', DOCKS.maki],
    ['nigiri-tray', DOCKS.nigiri],
  ] as const) {
    for (let i = 0; i < 3; i++) {
      for (const kind of tray === 'maki-tray'
        ? ['nori', 'rice', 'vegetable']
        : ['rice']) {
        initial[`${tray}-${kind}-${i}`] = {
          position:
            kind === 'vegetable'
              ? [
                  DOCKS.makiVegetables.position[0] + (i - 1) * 0.24,
                  1.44,
                  DOCKS.makiVegetables.position[2],
                ]
              : [
                  at.position[0] + 0.65,
                  at.position[1] + 0.04 + (kind === 'nori' ? 0 : 0.09),
                  at.position[2] + (i - 1) * 0.2,
                ],
          heading: at.heading,
        };
      }
    }
    initial[`${tray}-lid`] = {
      position: [
        DOCKS.sealer.position[0] + 0.55,
        1.48 + (tray === 'maki-tray' ? 0.04 : 0),
        DOCKS.sealer.position[2],
      ],
      heading: Math.PI,
    };
  }
  function ingredients(
    worker: WorkerId,
    at: Dock,
    tray: string,
    after: number,
    maki: boolean,
  ) {
    ready[worker] = Math.max(ready[worker], after);
    for (let i = 0; i < 3; i++) {
      for (const kind of maki ? ['nori', 'rice', 'vegetable'] : ['rice']) {
        const id = `${tray}-${kind}-${i}`,
          from = initial[id];
        const source = {
          ...dock(
            from.position[0],
            from.position[2] + 0.57,
            Math.PI,
            from.position[1],
          ),
          position: from.position,
        };
        const target = dock(
          at.position[0] - (i - 1) * 0.27,
          at.point[1],
          Math.PI,
          at.position[1] +
            (kind === 'nori' ? 0.06 : kind === 'rice' ? 0.105 : 0.22),
        );
        carry(worker, id, source, target, ready[worker]);
      }
    }
    return work(
      worker,
      at,
      tray,
      ready[worker],
      maki ? 'Roll and portion maki' : 'Shape and top nigiri',
    );
  }
  const mDelivered = carry(
    'store',
    'maki-tray',
    DOCKS.rawMaki,
    DOCKS.prepMaki,
    0,
  );
  const nDelivered = carry(
    'store',
    'nigiri-tray',
    DOCKS.rawNigiri,
    DOCKS.prepNigiri,
    mDelivered,
  );
  walk('store', WORKER_HOME.store);
  const vegetablesCut = work(
    'vegetables',
    DOCKS.vegetables,
    'vegetable-tray',
    0,
    'Slice cucumber and avocado',
  );
  const vegetablesReady = carry(
    'vegetables',
    'vegetable-tray',
    DOCKS.vegetables,
    DOCKS.makiVegetables,
    vegetablesCut,
  );
  walk('vegetables', WORKER_HOME.vegetables);
  const mCut = work(
    'prep',
    DOCKS.prepMaki,
    'maki-tray',
    mDelivered,
    'Portion salmon',
  );
  const mReady = carry('prep', 'maki-tray', DOCKS.prepMaki, DOCKS.maki, mCut);
  const nCut = work(
    'prep',
    DOCKS.prepNigiri,
    'nigiri-tray',
    nDelivered,
    'Portion salmon',
  );
  const nReady = carry(
    'prep',
    'nigiri-tray',
    DOCKS.prepNigiri,
    DOCKS.nigiri,
    nCut,
  );
  walk('prep', WORKER_HOME.prep);
  const mAssembled = ingredients(
    'maki',
    DOCKS.maki,
    'maki-tray',
    Math.max(mReady, vegetablesReady, ready.prep),
    true,
  );
  const mPacked = carry(
    'maki',
    'maki-tray',
    DOCKS.maki,
    DOCKS.packMaki,
    mAssembled,
  );
  walk('maki', WORKER_HOME.maki);
  const nAssembled = ingredients(
    'nigiri',
    DOCKS.nigiri,
    'nigiri-tray',
    Math.max(nReady, ready.prep),
    false,
  );
  const nPacked = carry(
    'nigiri',
    'nigiri-tray',
    DOCKS.nigiri,
    DOCKS.packNigiri,
    nAssembled,
  );
  walk('nigiri', WORKER_HOME.nigiri);
  for (const [tray, source, chilled, after] of [
    ['maki-tray', DOCKS.packMaki, DOCKS.chilledMaki, mPacked],
    ['nigiri-tray', DOCKS.packNigiri, DOCKS.chilledNigiri, nPacked],
  ] as const) {
    carry(
      'packing',
      tray,
      source,
      DOCKS.sealer,
      Math.max(after, ready.maki, ready.nigiri),
    );
    const lid = initial[`${tray}-lid`];
    carry(
      'packing',
      `${tray}-lid`,
      {
        ...dock(
          lid.position[0],
          lid.position[2] + 0.57,
          Math.PI,
          lid.position[1],
        ),
        position: lid.position,
      },
      {
        ...DOCKS.sealer,
        position: [
          DOCKS.sealer.position[0],
          DOCKS.sealer.position[1] + 0.28,
          DOCKS.sealer.position[2],
        ],
      },
      ready.packing,
    );
    const sealed = work(
      'packing',
      DOCKS.sealer,
      tray,
      ready.packing,
      'Seal sushi tray',
    );
    carry('packing', tray, DOCKS.sealer, chilled, sealed);
  }
  walk('packing', WORKER_HOME.packing);
  actions.sort((a, b) => a.start - b.start);
  return {
    actions,
    initial,
    duration: Math.max(...actions.map((a) => a.end)),
    milestones: {
      mDelivered,
      nDelivered,
      vegetablesReady,
      mReady,
      nReady,
      mAssembled,
      nAssembled,
      mPacked,
      nPacked,
    },
  };
}
export const PRODUCTION = createProductionPlan();
export function sampleWorker(worker: WorkerId, seconds: number) {
  let result = pose(WORKER_HOME[worker].point, WORKER_HOME[worker].heading);
  let action: Action | undefined;
  let progress = 0;
  for (const a of PRODUCTION.actions) {
    if (a.worker !== worker || seconds < a.start) continue;
    if (a.kind === 'walk' || a.kind === 'turn') {
      const t = Math.min(1, (seconds - a.start) / (a.end - a.start));
      result = {
        position: a.from.position.map((n, i) =>
          mix(n, a.to.position[i], t),
        ) as unknown as Point3,
        heading: headingMix(a.from.heading, a.to.heading, ease(t)),
      };
    }
    if (seconds < a.end) {
      action = a;
      progress = (seconds - a.start) / (a.end - a.start);
    }
  }
  return { ...result, action, progress, walking: action?.kind === 'walk' };
}
export function sampleObject(id: string, seconds: number): Pose {
  let result = PRODUCTION.initial[id];
  for (const a of PRODUCTION.actions) {
    if (a.object !== id || seconds < a.start || a.kind === 'work') continue;
    if (a.kind === 'transfer') {
      const progress = (seconds - a.start) / (a.end - a.start);
      const t = Math.max(0, Math.min(1, (progress - 0.2) / 0.6)),
        f = ease(t);
      result = {
        position: a.from.position.map(
          (n, i) =>
            mix(n, a.to.position[i], f) +
            (i === 1 ? Math.sin(Math.PI * t) * 0.12 : 0),
        ) as unknown as Point3,
        heading: headingMix(a.from.heading, a.to.heading, f),
      };
    } else {
      const state = sampleWorker(a.worker, Math.min(seconds, a.end - 1e-8));
      result = held([state.position[0], state.position[2]], state.heading);
    }
  }
  return result;
}
