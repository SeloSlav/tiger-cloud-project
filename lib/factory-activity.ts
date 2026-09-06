import * as THREE from 'three';
import { ZONES } from './telemetry';
import { DELIVERY_ROUTES, sampleDelivery } from './factory-motion';

export function createFactoryActivity() {
  const root = new THREE.Group();
  root.name = 'factory-activity';
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roundGeometry = new THREE.SphereGeometry(0.5, 10, 8);
  const capGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const shadowGeometry = new THREE.CircleGeometry(0.5, 16);
  const materials: THREE.Material[] = [];
  const mat = (color: string) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    materials.push(material);
    return material;
  };
  const coat = mat('#e9efe3'),
    trousers = mat('#304d59'),
    boots = mat('#18303b');
  const apron = mat('#88b9b0'),
    carrierApron = mat('#adbf7e'),
    gloves = mat('#81bbd0');
  const skin = [mat('#dfab85'), mat('#ac7555'), mat('#79513e')];
  const trayMat = mat('#20383a'),
    fish = mat('#f89871'),
    rice = mat('#f8edcb');
  const green = mat('#b6d16c'),
    nori = mat('#244935');
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#030c10',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  materials.push(shadowMat);
  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.scale.set(w, h, d);
    parent.add(object);
    return object;
  }
  const box = (
    g: THREE.Object3D,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => mesh(g, boxGeometry, m, x, y, z, w, h, d);
  function payload(kind: 'fish' | 'ingredients' | 'sushi') {
    const tray = new THREE.Group();
    box(tray, trayMat, 0, 0, 0, 0.72, 0.055, 0.46);
    for (const x of [-0.22, 0, 0.22]) {
      if (kind === 'sushi') {
        for (const z of [-0.1, 0.1]) {
          mesh(tray, capGeometry, nori, x, 0.09, z, 0.17, 0.12, 0.17);
          mesh(tray, capGeometry, rice, x, 0.155, z, 0.135, 0.014, 0.135);
          box(tray, fish, x, 0.17, z, 0.055, 0.016, 0.055);
        }
      } else {
        mesh(
          tray,
          roundGeometry,
          kind === 'fish' ? fish : green,
          x,
          0.095,
          0,
          0.17,
          0.11,
          0.34,
        );
      }
    }
    return tray;
  }
  function worker(index: number, cargo?: 'fish' | 'ingredients' | 'sushi') {
    const group = new THREE.Group();
    root.add(group);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.011;
    shadow.scale.set(0.85, 0.6, 1);
    group.add(shadow);
    const body = new THREE.Group();
    group.add(body);
    box(body, coat, 0, 1.08, 0, 0.48, 0.59, 0.3);
    box(body, cargo ? carrierApron : apron, 0, 0.99, 0.165, 0.4, 0.61, 0.035);
    mesh(
      body,
      roundGeometry,
      skin[index % skin.length],
      0,
      1.57,
      0,
      0.34,
      0.4,
      0.33,
    );
    mesh(body, capGeometry, coat, 0, 1.77, 0, 0.43, 0.17, 0.4);
    box(body, gloves, 0, 1.53, 0.164, 0.26, 0.12, 0.035);
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 1.35, 0);
      body.add(shoulder);
      box(shoulder, coat, 0, -0.17, 0, 0.17, 0.34, 0.18);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      box(elbow, coat, 0, -0.13, 0, 0.15, 0.27, 0.16);
      mesh(elbow, roundGeometry, gloves, 0, -0.285, 0, 0.17, 0.16, 0.17);
      return { shoulder, elbow };
    });
    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.78, 0);
      body.add(leg);
      box(leg, trousers, 0, -0.31, 0, 0.18, 0.62, 0.2);
      box(leg, boots, 0, -0.66, 0.065, 0.21, 0.16, 0.34);
      return leg;
    });
    const carried = cargo ? payload(cargo) : null;
    if (carried) {
      carried.position.set(0, 1.13, 0.55);
      body.add(carried);
    }
    return { group, body, arms, legs, carried };
  }

  const operators = ZONES.map((zone, index) => {
    const rig = worker(index);
    rig.group.name = `operator-${zone.id}`;
    rig.group.position.set(
      zone.x + (zone.id === 'C2' ? 1.25 : -1.35),
      0.09,
      zone.z + (zone.id === 'A1' ? 0.35 : -0.24),
    );
    rig.group.rotation.y = zone.id === 'A1' ? 0 : Math.PI;
    return rig;
  });
  const runners = DELIVERY_ROUTES.map((route, index) => {
    const rig = worker(index + 6, route.cargo);
    rig.group.name = route.name;
    return { route, rig };
  });
  const debugRoutes = new THREE.Group();
  debugRoutes.name = 'delivery-route-guides';
  debugRoutes.visible = false;
  root.add(debugRoutes);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: '#f9df9b',
    depthTest: false,
  });
  materials.push(lineMaterial);
  const routeGeometries = DELIVERY_ROUTES.map((route) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      route.points.map(([x, z]) => new THREE.Vector3(x, 0.18, z)),
    );
    debugRoutes.add(new THREE.Line(geometry, lineMaterial));
    return geometry;
  });
  const yaw = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let initialized = false;
  function update(seconds: number, deltaSeconds: number) {
    operators.forEach((rig, index) => {
      const phase = seconds * 4.2 + index * 1.6;
      rig.body.rotation.x = -0.045 + Math.sin(phase * 0.5) * 0.025;
      rig.arms.forEach(({ shoulder, elbow }, side) => {
        shoulder.rotation.x = -1.28 + Math.sin(phase + side * 1.1) * 0.12;
        elbow.rotation.x = -0.75 + Math.sin(phase + side) * 0.18;
      });
    });
    runners.forEach(({ route, rig }) => {
      const state = sampleDelivery(route, seconds);
      const stride =
        Math.sin(state.distance * 10.5) * (state.walking ? 0.42 : 0);
      rig.group.position.set(state.x, 0.09, state.z);
      yaw.setFromAxisAngle(up, state.heading);
      if (!initialized) rig.group.quaternion.copy(yaw);
      else if (deltaSeconds > 0)
        rig.group.quaternion.slerp(yaw, 1 - Math.exp(-12 * deltaSeconds));
      rig.body.position.y = state.walking ? Math.abs(stride) * 0.06 : 0;
      rig.legs[0].rotation.x = stride;
      rig.legs[1].rotation.x = -stride;
      const handling = !state.walking
        ? Math.sin(state.progress * Math.PI) * 0.2
        : 0;
      rig.arms.forEach(({ shoulder, elbow }, side) => {
        shoulder.rotation.x =
          state.carrying || !state.walking
            ? -1.05 - handling
            : stride * (side ? -0.7 : 0.7);
        elbow.rotation.x = state.carrying || !state.walking ? -0.5 : -0.14;
      });
      if (rig.carried) {
        rig.carried.visible = state.carrying;
        rig.carried.position.y = 1.13 + handling * 0.35;
      }
    });
  }
  update(0, 0);
  initialized = true;
  return {
    root,
    debugRoutes,
    update,
    dispose() {
      [
        boxGeometry,
        roundGeometry,
        capGeometry,
        shadowGeometry,
        ...routeGeometries,
      ].forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.removeFromParent();
    },
  };
}
