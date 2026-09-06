import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ZONES } from '../lib/telemetry';
import {
  facilityFrustum,
  facilityShot,
  cameraEase,
} from '../lib/facility-camera';
import {
  PRODUCTION_ROUTES,
  PRODUCTION_PERIOD,
  BATCH_FLOWS,
  sampleRoute,
  sampleBatch,
  DEMO_START,
  MOTION,
} from '../lib/factory-motion';
import { createFacilityKit } from '../lib/facility-scene';
import { createFactoryActivity } from '../lib/factory-activity';

void test('every focused zone fits in portrait, narrow and wide camera frames', () => {
  for (const aspect of [0.7, 1.2, 2.4]) {
    const { halfWidth, halfHeight } = facilityFrustum(aspect);
    for (const zone of ZONES) {
      const shot = facilityShot(aspect, zone.id);
      const camera = new THREE.OrthographicCamera(
        -halfWidth,
        halfWidth,
        halfHeight,
        -halfHeight,
        0.1,
        150,
      );
      camera.position.copy(shot.position);
      camera.quaternion.copy(shot.quaternion);
      camera.zoom = shot.zoom;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      assert.ok(shot.zoom > 1.8, 'Focus must be a meaningful close-up');
      for (const x of [-2.675, 2.675])
        for (const y of [0, 3])
          for (const z of [-2.775, 2.775]) {
            const point = new THREE.Vector3(zone.x + x, y, zone.z + z).project(
              camera,
            );
            assert.ok(
              Math.abs(point.x) < 0.9 && Math.abs(point.y) < 0.9,
              `${zone.id} equipment cropped at aspect ${aspect}`,
            );
          }
      const label = new THREE.Vector3(zone.x, 3.65, zone.z - 1.5).project(
        camera,
      );
      assert.ok(Math.abs(label.x) + (1.45 * shot.zoom) / halfWidth < 0.95);
      assert.ok(Math.abs(label.y) + (0.665 * shot.zoom) / halfHeight < 0.95);
    }
    const overview = facilityShot(aspect, null);
    assert.equal(overview.zoom, 1);
    assert.deepEqual(overview.target.toArray(), [0, 0, 0]);
  }
  assert.equal(cameraEase(0), 0);
  assert.equal(cameraEase(1), 1);
  assert.equal(cameraEase(0.5), 0.5);
});

void test('batches are pipelined in order and never double-book a carrier', () => {
  assert.equal(PRODUCTION_ROUTES.length, 14);
  for (const flow of BATCH_FLOWS) {
    for (let i = 1; i < flow.routes.length; i++) {
      assert.ok(
        flow.starts[i] + flow.routes[i].workStart >=
          flow.starts[i - 1] + flow.routes[i - 1].dropoff,
        'Work must wait for the previous delivery',
      );
    }
    for (let t = 0; t < flow.period; t += 0.2) {
      const owners = new Set<string>();
      for (let slot = 0; slot < flow.slots; slot++) {
        const state = sampleBatch(flow, slot, t);
        if (!state.owner) continue;
        assert.ok(!owners.has(state.owner.id));
        owners.add(state.owner.id);
        const carrier = sampleRoute(state.owner, t);
        assert.ok(carrier.cargo);
        assert.ok(
          new THREE.Vector3(...carrier.cargo.position).distanceTo(
            new THREE.Vector3(...state.position),
          ) < 1e-6,
          'A batch must stay with its actual carrier',
        );
      }
    }
  }
});

void test('the demo stays busy through a complete shift cycle', () => {
  let walking = 0,
    cargo = 0,
    samples = 0;
  for (let t = 0; t < PRODUCTION_PERIOD; t += 0.1) {
    const states = PRODUCTION_ROUTES.map((r) => sampleRoute(r, t));
    const moving = states.filter((s) => s.walking && s.visible).length;
    const loaded = states.filter((s) => s.cargo && s.visible).length;
    assert.ok(moving >= 1, 'The whole floor must never stop together');
    walking += moving;
    cargo += loaded;
    samples++;
  }
  assert.ok(
    walking / samples >= 5,
    `Only ${walking / samples} workers walking on average`,
  );
  assert.ok(
    cargo / samples >= 2.5,
    `Only ${cargo / samples} trays moving on average`,
  );
  const opening = PRODUCTION_ROUTES.map((r) => sampleRoute(r, DEMO_START));
  assert.ok(
    opening.filter((s) => s.walking && s.visible).length >= 4,
    'Open on a busy factory, not an empty shift',
  );
});

void test('workers and visible batches remain continuous across actions and loop boundaries', () => {
  const dt = 1e-5;
  for (const route of PRODUCTION_ROUTES) {
    for (const time of [
      0,
      PRODUCTION_PERIOD,
      ...route.actions.flatMap((a) => [a.start, a.end]),
    ]) {
      const a = sampleRoute(route, time + route.phase - dt),
        b = sampleRoute(route, time + route.phase + dt);
      assert.ok(
        new THREE.Vector3(...a.position).distanceTo(
          new THREE.Vector3(...b.position),
        ) <
          MOTION.speed * dt * 2 + 1e-6,
      );
    }
  }
  for (const flow of BATCH_FLOWS)
    for (let slot = 0; slot < flow.slots; slot++) {
      let previous = sampleBatch(flow, slot, 0);
      for (let t = 0.05; t < flow.period * 2; t += 0.05) {
        const state = sampleBatch(flow, slot, t);
        if (previous.visible && state.visible)
          assert.ok(
            new THREE.Vector3(...state.position).distanceTo(
              new THREE.Vector3(...previous.position),
            ) < 0.4,
            `${flow.product} tray jumps on the production floor at ${t}`,
          );
        previous = state;
      }
    }
});

void test('parallel workers stay clear of equipment and one another', () => {
  const kit = createFacilityKit(),
    accent = new THREE.MeshStandardMaterial();
  const obstacles: THREE.Box3[] = [];
  for (const zone of ZONES) {
    const group = kit.buildZone(zone.id, accent);
    group.position.set(zone.x, 0, zone.z);
    group.updateMatrixWorld(true);
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const box = new THREE.Box3().setFromObject(object);
      if (box.min.y < 1.15 && box.max.y > 0.2) obstacles.push(box);
    });
  }
  for (let t = 0; t < PRODUCTION_PERIOD; t += 0.05) {
    const states = PRODUCTION_ROUTES.map((r) => sampleRoute(r, t));
    for (const [i, state] of states.entries()) {
      if (!state.visible) continue;
      const [x, , z] = state.position;
      for (const box of obstacles) {
        const dx = Math.max(box.min.x - x, 0, x - box.max.x),
          dz = Math.max(box.min.z - z, 0, z - box.max.z);
        assert.ok(
          Math.hypot(dx, dz) > 0.22,
          `${PRODUCTION_ROUTES[i].id} clips equipment at ${t}`,
        );
      }
      for (let j = i + 1; j < states.length; j++) {
        const other = states[j];
        if (!other.visible) continue;
        assert.ok(
          Math.hypot(x - other.position[0], z - other.position[2]) > 0.44,
          `${PRODUCTION_ROUTES[i].id} collides with ${PRODUCTION_ROUTES[j].id} at ${t}`,
        );
      }
    }
  }
  kit.dispose();
  accent.dispose();
});

void test('the long-running demo reuses bounded objects and pauses deterministically', () => {
  const activity = createFactoryActivity();
  const identities = [...activity.objects.values()];
  const geometries = new Set<THREE.BufferGeometry>();
  let meshes = 0;
  activity.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      meshes++;
    }
  });
  assert.ok(
    meshes < 750 && geometries.size === 4,
    `Geometry budget: ${meshes} meshes, ${geometries.size} geometries`,
  );
  assert.ok(identities.length >= 12);
  const snapshot = () =>
    identities.map((o) => [
      ...o.position.toArray(),
      ...o.quaternion.toArray(),
      o.visible,
    ]);
  activity.update(37);
  const paused = snapshot();
  activity.update(37, 100);
  assert.deepEqual(snapshot(), paused);
  for (const t of [0, 1, 120, 1000, 10000, 100000]) {
    activity.update(t, 0.033);
    activity.root.traverse((o) =>
      assert.ok(
        [...o.position.toArray(), ...o.quaternion.toArray()].every(
          Number.isFinite,
        ),
      ),
    );
  }
  activity.update(37);
  assert.deepEqual(snapshot(), paused);
  assert.deepEqual([...activity.objects.values()], identities);
  assert.equal(activity.root.userData.workers, 14);
  activity.dispose();
});

void test('loaded worker gloves touch the actual tray handles', () => {
  const activity = createFactoryActivity();
  for (let t = 0; t < PRODUCTION_PERIOD; t += 0.25) {
    activity.update(t);
    activity.root.updateMatrixWorld(true);
    for (const object of activity.objects.values()) {
      const id = object.userData.owner;
      const route = PRODUCTION_ROUTES.find((r) => r.id === id);
      if (!route || !object.visible) continue;
      const state = sampleRoute(route, t + DEMO_START);
      if (state.action?.kind !== 'walk') continue;
      for (const sign of [-1, 1]) {
        const hand = activity.root.getObjectByName(`hand-${id}-${sign}`)!;
        const handle = new THREE.Vector3(sign * 0.45, 0.025, 0)
          .applyQuaternion(object.quaternion)
          .add(object.position);
        assert.ok(
          hand.getWorldPosition(new THREE.Vector3()).distanceTo(handle) < 1e-7,
        );
      }
    }
  }
  activity.dispose();
});
