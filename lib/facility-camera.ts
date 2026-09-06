import * as THREE from 'three';
import { ZONES, type ZoneId } from './telemetry';

export const CAMERA = {
  offset: new THREE.Vector3(23, 26, 29),
  transitionSeconds: 0.85,
  minZoom: 0.75,
  maxZoom: 5,
  focusOccupancy: 0.78,
};

export function facilityFrustum(aspect: number) {
  const halfHeight = Math.max(11.2, 16 / aspect);
  return { halfHeight, halfWidth: halfHeight * aspect };
}

// Fit the equipment, people and selected label in camera space, at any aspect.
export function facilityShot(aspect: number, id: ZoneId | null) {
  const zone = ZONES.find((z) => z.id === id);
  const target = new THREE.Vector3(zone?.x ?? 0, zone ? 1.8 : 0, zone?.z ?? 0);
  const position = target.clone().add(CAMERA.offset);
  const forward = CAMERA.offset.clone().normalize();
  const right = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), forward)
    .normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const { halfHeight, halfWidth } = facilityFrustum(aspect);
  const projectedWidth = Math.abs(right.x) * 5.8 + Math.abs(right.z) * 5.8;
  const projectedHeight =
    Math.abs(up.x) * 5.8 + Math.abs(up.y) * 4.2 + Math.abs(up.z) * 5.8;
  const zoom = zone
    ? Math.min(
        (halfWidth * 2 * CAMERA.focusOccupancy) / projectedWidth,
        (halfHeight * 2 * CAMERA.focusOccupancy) / projectedHeight,
        CAMERA.maxZoom,
      )
    : 1;
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)),
  );
  return { position, target, zoom, quaternion };
}

export const cameraEase = (progress: number) => {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
};
