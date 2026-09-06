export type FloorPoint = readonly [number, number];
export type DeliveryRoute = {
  name: string;
  cargo: 'fish' | 'ingredients' | 'sushi';
  points: readonly FloorPoint[];
  speed: number;
  dwell: number;
  offset: number;
  sourceFacing: number;
  destinationFacing: number;
};

// The runners use the clear bench aisles and the 0.9 m passage between B and C.
export const DELIVERY_ROUTES: readonly DeliveryRoute[] = [
  {
    name: 'Fish store → preparation',
    cargo: 'fish',
    points: [
      [-4.8, -3.1],
      [0.45, -3.15],
    ],
    speed: 0.62,
    dwell: 2.4,
    offset: 3,
    sourceFacing: 0,
    destinationFacing: Math.PI,
  },
  {
    name: 'Preparation → maki',
    cargo: 'ingredients',
    points: [
      [1.5, -3.15],
      [3.1, -3.15],
      [3.1, 3.85],
      [1.45, 3.85],
    ],
    speed: 0.66,
    dwell: 2.8,
    offset: 9,
    sourceFacing: Math.PI,
    destinationFacing: Math.PI,
  },
  {
    name: 'Maki → packing',
    cargo: 'sushi',
    points: [
      [0.25, 3.85],
      [7.1, 3.85],
    ],
    speed: 0.6,
    dwell: 2.6,
    offset: 5,
    sourceFacing: 0,
    destinationFacing: 0,
  },
];

export function routeLength(route: DeliveryRoute) {
  return route.points
    .slice(1)
    .reduce(
      (length, point, i) =>
        length +
        Math.hypot(
          point[0] - route.points[i][0],
          point[1] - route.points[i][1],
        ),
      0,
    );
}

export function deliveryCycle(route: DeliveryRoute) {
  return 2 * (routeLength(route) / route.speed + route.dwell);
}

export function sampleDelivery(route: DeliveryRoute, elapsed: number) {
  const length = routeLength(route);
  const travel = length / route.speed;
  const period = 2 * (travel + route.dwell);
  const time = (((elapsed + route.offset) % period) + period) % period;
  const phase =
    time < route.dwell
      ? 'pickup'
      : time < route.dwell + travel
        ? 'deliver'
        : time < 2 * route.dwell + travel
          ? 'dropoff'
          : 'return';
  const walking = phase === 'deliver' || phase === 'return';
  const progress =
    phase === 'pickup'
      ? time / route.dwell
      : phase === 'dropoff'
        ? (time - route.dwell - travel) / route.dwell
        : 0;
  let distance =
    phase === 'pickup'
      ? 0
      : phase === 'dropoff'
        ? length
        : phase === 'deliver'
          ? (time - route.dwell) * route.speed
          : length - (time - 2 * route.dwell - travel) * route.speed;
  distance = Math.min(length, Math.max(0, distance));
  let remaining = distance;
  let x = route.points[0][0],
    z = route.points[0][1],
    heading = 0;
  for (let i = 1; i < route.points.length; i++) {
    const from = route.points[i - 1],
      to = route.points[i];
    const segment = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (remaining <= segment || i === route.points.length - 1) {
      const fraction = segment ? remaining / segment : 0;
      x = from[0] + (to[0] - from[0]) * fraction;
      z = from[1] + (to[1] - from[1]) * fraction;
      heading =
        Math.atan2(to[0] - from[0], to[1] - from[1]) +
        (phase === 'return' ? Math.PI : 0);
      break;
    }
    remaining -= segment;
  }
  if (phase === 'pickup') heading = route.sourceFacing;
  if (phase === 'dropoff') heading = route.destinationFacing;
  const carrying =
    phase === 'deliver' ||
    (phase === 'pickup' && progress >= 0.5) ||
    (phase === 'dropoff' && progress < 0.5);
  return { x, z, heading, walking, carrying, phase, progress, distance };
}
