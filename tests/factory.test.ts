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
  DELIVERY_ROUTES,
  deliveryCycle,
  routeLength,
  sampleDelivery,
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

void test('deliveries pick up cargo, put it down, and return empty', () => {
  for (const route of DELIVERY_ROUTES) {
    const sample = (time: number) => sampleDelivery(route, time - route.offset);
    const travel = routeLength(route) / route.speed;
    assert.equal(sample(route.dwell * 0.25).carrying, false);
    assert.equal(sample(route.dwell * 0.75).carrying, true);
    assert.equal(sample(route.dwell + travel * 0.5).phase, 'deliver');
    assert.equal(sample(route.dwell + travel * 0.5).carrying, true);
    assert.equal(sample(route.dwell * 1.75 + travel).carrying, false);
    assert.equal(sample(2 * route.dwell + travel * 1.5).phase, 'return');
    assert.equal(sample(2 * route.dwell + travel * 1.5).carrying, false);
    assert.deepEqual(
      sampleDelivery(route, 0),
      sampleDelivery(route, deliveryCycle(route)),
    );
  }
});

void test('delivery movement is continuous through corners and cycle boundaries', () => {
  for (const route of DELIVERY_ROUTES) {
    const dt = 1 / 60;
    let previous = sampleDelivery(route, 0);
    for (let t = dt; t < deliveryCycle(route) * 2; t += dt) {
      const next = sampleDelivery(route, t);
      const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
      assert.ok(
        distance <= route.speed * dt + 1e-8,
        `${route.name} has a position jump`,
      );
      previous = next;
    }
  }
});

void test('delivery paths keep worker bodies clear of factory equipment', () => {
  const kit = createFacilityKit();
  const accent = new THREE.MeshStandardMaterial();
  const obstacles: THREE.Box3[] = [];
  for (const zone of ZONES) {
    const group = kit.buildZone(zone.id, accent);
    group.position.set(zone.x, 0, zone.z);
    group.updateMatrixWorld(true);
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const box = new THREE.Box3().setFromObject(object);
      if (box.min.y < 0.9 && box.max.y > 0.2) obstacles.push(box);
    });
  }
  for (const route of DELIVERY_ROUTES) {
    for (let t = 0; t < deliveryCycle(route); t += 0.1) {
      const state = sampleDelivery(route, t);
      for (const box of obstacles) {
        const dx = Math.max(box.min.x - state.x, 0, state.x - box.max.x);
        const dz = Math.max(box.min.z - state.z, 0, state.z - box.max.z);
        assert.ok(
          Math.hypot(dx, dz) > 0.22,
          `${route.name} walks through equipment`,
        );
      }
    }
  }
  kit.dispose();
  accent.dispose();
});

void test('animated rigs stay finite and share a bounded geometry budget', () => {
  const activity = createFactoryActivity();
  let count = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  activity.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      count++;
      geometries.add(object.geometry);
    }
  });
  assert.ok(count < 250);
  assert.ok(geometries.size <= 4);
  for (let seconds = 0; seconds <= 100; seconds += 0.25) {
    activity.update(seconds, 0.25);
    activity.root.traverse((object) => {
      assert.ok(
        [...object.position.toArray(), ...object.quaternion.toArray()].every(
          Number.isFinite,
        ),
      );
    });
  }
  activity.dispose();
});
