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
  PRODUCTION,
  WORKER_HOME,
  DOCKS,
  sampleWorker,
  sampleObject,
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

void test('production waits for inputs and processes both recipes before packing', () => {
  const { actions, milestones: m } = PRODUCTION;
  assert.ok(m.mReady > m.mDelivered && m.nReady > m.nDelivered);
  for (const a of actions) {
    if (a.worker === 'maki')
      assert.ok(a.start >= Math.max(m.mReady, m.vegetablesReady));
    if (a.worker === 'nigiri') assert.ok(a.start >= m.nReady);
    if (a.worker === 'packing' && a.object === 'maki-tray')
      assert.ok(a.start >= m.mPacked);
    if (a.worker === 'packing' && a.object === 'nigiri-tray')
      assert.ok(a.start >= m.nPacked);
  }
  assert.ok(m.mPacked > m.mAssembled && m.nPacked > m.nAssembled);
  for (const worker of Object.keys(WORKER_HOME)) {
    const jobs = actions.filter((a) => a.worker === worker);
    for (let i = 1; i < jobs.length; i++)
      assert.ok(jobs[i].start >= jobs[i - 1].end - 1e-8);
  }
  for (const object of Object.keys(PRODUCTION.initial)) {
    const handlers = actions.filter((a) => a.object === object);
    for (let i = 1; i < handlers.length; i++)
      assert.ok(
        handlers[i].start >= handlers[i - 1].end - 1e-8,
        `${object} has two owners`,
      );
  }
});

void test('workers and handled objects stay continuous through every action boundary', () => {
  const dt = 1e-5;
  for (const action of PRODUCTION.actions) {
    for (const t of [action.start, action.end]) {
      const before = sampleWorker(action.worker, Math.max(0, t - dt));
      const after = sampleWorker(action.worker, t + dt);
      assert.ok(
        new THREE.Vector3(...before.position).distanceTo(
          new THREE.Vector3(...after.position),
        ) <
          MOTION.speed * dt * 2 + 1e-6,
      );
      if (action.object) {
        const a = sampleObject(action.object, Math.max(0, t - dt));
        const b = sampleObject(action.object, t + dt);
        assert.ok(
          new THREE.Vector3(...a.position).distanceTo(
            new THREE.Vector3(...b.position),
          ) < 0.001,
          `${action.object} jumps at ${t}: ${action.label}`,
        );
      }
    }
  }
});

void test('delivery paths keep worker bodies clear of equipment', () => {
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
  for (const action of PRODUCTION.actions.filter((a) => a.kind === 'walk')) {
    for (let t = action.start; t <= action.end; t += 0.05) {
      const {
        position: [x, , z],
      } = sampleWorker(action.worker, t);
      for (const box of obstacles) {
        const dx = Math.max(box.min.x - x, 0, x - box.max.x);
        const dz = Math.max(box.min.z - z, 0, z - box.max.z);
        assert.ok(
          Math.hypot(dx, dz) > 0.22,
          `${action.worker} walks through equipment at ${t}: ${x}, ${z}`,
        );
      }
    }
  }
  kit.dispose();
  accent.dispose();
});

void test('trays, recipe components and lids persist, attach without jumps, and finish in the chiller', () => {
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
  assert.ok(meshes < 260 && geometries.size === 4);
  const previous = new Map<string, THREE.Vector3>();
  for (let t = 0; t < PRODUCTION.duration; t += 0.1) {
    activity.update(t, 0.1);
    for (const [id, object] of activity.objects) {
      assert.equal(object.visible, true, `${id} disappeared`);
      assert.ok(object.position.toArray().every(Number.isFinite));
      if (previous.has(id))
        assert.ok(
          object.position.distanceTo(previous.get(id)!) < 0.6,
          `${id} jumped at ${t}`,
        );
      previous.set(id, object.position.clone());
    }
  }
  activity.update(PRODUCTION.duration);
  assert.deepEqual([...activity.objects.values()], identities);
  assert.deepEqual(activity.objects.get('maki-tray')!.position.toArray(), [
    ...DOCKS.chilledMaki.position,
  ]);
  assert.deepEqual(activity.objects.get('nigiri-tray')!.position.toArray(), [
    ...DOCKS.chilledNigiri.position,
  ]);
  const final = identities.map((o) => o.position.toArray());
  activity.update(PRODUCTION.duration + 1000);
  assert.deepEqual(
    identities.map((o) => o.position.toArray()),
    final,
    'Finished stock must stay chilled until explicit replay',
  );
  activity.update(0);
  assert.deepEqual(activity.objects.get('maki-tray')!.position.toArray(), [
    ...DOCKS.rawMaki.position,
  ]);
  activity.dispose();
});

void test('loaded travel has the same object between the worker hands', () => {
  const activity = createFactoryActivity();
  for (const a of PRODUCTION.actions.filter(
    (a) => a.kind === 'walk' && a.object,
  )) {
    activity.update((a.start + a.end) / 2);
    activity.root.updateMatrixWorld(true);
    const object = activity.objects.get(a.object!)!;
    const worker = activity.root.getObjectByName(`worker-${a.worker}`)!;
    assert.equal(object.userData.owner, a.worker);
    assert.ok(object.position.distanceTo(worker.position) < 1.7);
    for (const sign of [-1, 1]) {
      const hand = activity.root.getObjectByName(`hand-${a.worker}-${sign}`)!;
      const large = a.object!.endsWith('-tray') || a.object!.endsWith('-lid');
      const handle = new THREE.Vector3(sign * (large ? 0.48 : 0.085), 0.025, 0)
        .applyQuaternion(object.quaternion)
        .add(object.position);
      assert.ok(
        hand.getWorldPosition(new THREE.Vector3()).distanceTo(handle) < 1e-7,
        'Gloves must touch the carried object',
      );
    }
  }
  activity.dispose();
});

void test('walking workers leave room for colleagues waiting at benches', () => {
  const ids = Object.keys(WORKER_HOME) as (keyof typeof WORKER_HOME)[];
  for (let t = 0; t < PRODUCTION.duration; t += 0.1) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = sampleWorker(ids[i], t).position,
          b = sampleWorker(ids[j], t).position;
        assert.ok(
          Math.hypot(a[0] - b[0], a[2] - b[2]) > 0.44,
          `${ids[i]} collides with ${ids[j]} at ${t}`,
        );
      }
  }
});
