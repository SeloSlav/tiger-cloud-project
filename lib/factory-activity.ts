import * as THREE from 'three';
import {
  BATCH_FLOWS,
  PRODUCTION_ROUTES,
  PRODUCTION_PERIOD,
  DEMO_START,
  MOTION,
  ease,
  mix,
  sampleBatch,
  sampleRoute,
  type Pose,
} from './factory-motion';
export function createFactoryActivity() {
  const root = new THREE.Group();
  root.name = 'factory-activity';
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roundGeometry = new THREE.SphereGeometry(0.5, 10, 8);
  const capGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const shadowGeometry = new THREE.CircleGeometry(0.5, 16);
  const materials: THREE.Material[] = [];
  const mat = (color: string, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness,
    });
    materials.push(m);
    return m;
  };
  const coat = mat('#e9efe3'),
    trousers = mat('#304d59'),
    boots = mat('#18303b');
  const apron = mat('#88b9b0'),
    carrierApron = mat('#adbf7e'),
    gloves = mat('#81bbd0');
  const skin = [mat('#dfab85'), mat('#ac7555'), mat('#79513e')];
  const trayMat = mat('#20383a'),
    fishMat = mat('#f89871'),
    riceMat = mat('#f8edcb');
  const green = mat('#b6d16c'),
    nori = mat('#244935'),
    steel = mat('#c5d8d7', 0.6);
  const glass = new THREE.MeshStandardMaterial({
    color: '#d8f5eb',
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    roughness: 0.2,
  });
  materials.push(glass);
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
  const down = new THREE.Vector3(0, -1, 0);
  function worker(index: number, id: string) {
    const group = new THREE.Group();
    group.name = `worker-${id}`;
    root.add(group);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.011;
    shadow.scale.set(0.85, 0.6, 1);
    group.add(shadow);
    const body = new THREE.Group();
    group.add(body);
    box(body, coat, 0, 1.08, 0, 0.48, 0.59, 0.3);
    box(
      body,
      id.endsWith('-0') || id.endsWith('-1') ? carrierApron : apron,
      0,
      0.99,
      0.165,
      0.4,
      0.61,
      0.035,
    );
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
      box(shoulder, coat, 0, -0.21, 0, 0.16, 0.42, 0.17);
      const elbow = new THREE.Group();
      body.add(elbow);
      box(elbow, coat, 0, -0.21, 0, 0.14, 0.42, 0.15);
      const hand = new THREE.Group();
      hand.name = `hand-${id}-${side}`;
      body.add(hand);
      mesh(hand, roundGeometry, gloves, 0, 0, 0, 0.16, 0.14, 0.16);
      return {
        shoulder,
        elbow,
        hand,
        origin: shoulder.position.clone(),
        target: new THREE.Vector3(),
      };
    });
    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.78, 0);
      body.add(leg);
      box(leg, trousers, 0, -0.31, 0, 0.18, 0.62, 0.2);
      box(leg, boots, 0, -0.66, 0.065, 0.21, 0.16, 0.34);
      return leg;
    });
    return { group, body, arms, legs };
  }
  const workers = PRODUCTION_ROUTES.map((route, i) => ({
    route,
    rig: worker(i, route.id),
  }));
  const objects = new Map<string, THREE.Group>();
  function tray(id: string, vegetables = false) {
    const group = new THREE.Group();
    group.name = id;
    root.add(group);
    objects.set(id, group);
    box(group, trayMat, 0, 0, 0, 0.9, 0.055, 0.58);
    for (const z of [-0.28, 0.28])
      box(group, trayMat, 0, 0.035, z, 0.9, 0.06, 0.025);
    for (const x of [-0.46, 0.46])
      box(group, steel, x, 0.025, 0, 0.045, 0.04, 0.2);
    const portions = [-0.26, 0, 0.26].map((x) =>
      mesh(
        group,
        roundGeometry,
        vegetables ? green : fishMat,
        x,
        0.09,
        0,
        0.2,
        0.12,
        0.4,
      ),
    );
    return { group, portions };
  }
  const batches = BATCH_FLOWS.flatMap((flow) =>
    Array.from({ length: flow.slots }, (_, slot) => {
      const id = `${flow.product}-batch-${slot}`;
      const payload = tray(id);
      const bases = [-0.26, 0, 0.26].map((x, i) => {
        const group = new THREE.Group();
        group.name = `${id}-ingredients-${i}`;
        root.add(group);
        if (flow.product === 'maki')
          mesh(group, capGeometry, nori, 0, -0.025, 0, 0.245, 0.15, 0.245);
        mesh(
          group,
          flow.product === 'maki' ? capGeometry : roundGeometry,
          riceMat,
          0,
          0.025,
          0,
          0.205,
          0.12,
          flow.product === 'maki' ? 0.205 : 0.32,
        );
        if (flow.product === 'maki')
          box(group, green, 0.07, 0.09, 0, 0.055, 0.04, 0.08);
        return { group, x };
      });
      const lid = new THREE.Group();
      lid.name = `${id}-lid`;
      root.add(lid);
      box(lid, glass, 0, 0, 0, 0.9, 0.035, 0.58);
      for (const z of [-0.275, 0.275])
        box(lid, steel, 0, -0.05, z, 0.9, 0.1, 0.02);
      return { flow, slot, id, ...payload, bases, lid };
    }),
  );
  const vegetableTrays = PRODUCTION_ROUTES.filter(
    (r) => r.product === 'vegetables',
  ).map((route) => ({ route, ...tray(`${route.id}-tray`, true) }));
  const debugRoutes = new THREE.Group();
  debugRoutes.name = 'delivery-route-guides';
  debugRoutes.visible = false;
  root.add(debugRoutes);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: '#f9df9b',
    depthTest: false,
  });
  materials.push(lineMaterial);
  const routeGeometries = PRODUCTION_ROUTES.flatMap((route) =>
    route.actions
      .filter((a) => a.kind === 'walk')
      .map((a) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(
          [a.from, a.to].map(
            (p) => new THREE.Vector3(p.position[0], 0.18, p.position[2]),
          ),
        );
        debugRoutes.add(new THREE.Line(geometry, lineMaterial));
        return geometry;
      }),
  );
  const direction = new THREE.Vector3(),
    bend = new THREE.Vector3(),
    joint = new THREE.Vector3(),
    target = new THREE.Vector3();
  const handTargets = new Map<string, THREE.Vector3>();
  const cargo = new Map<string, THREE.Group>();
  function applyPose(group: THREE.Group, state: Pose) {
    group.position.set(...state.position);
    group.rotation.set(0, state.heading, 0);
  }
  function update(seconds: number, _deltaSeconds = 0) {
    const time = Math.max(0, seconds) + DEMO_START;
    cargo.clear();
    handTargets.clear();
    for (const batch of batches) {
      const state = sampleBatch(batch.flow, batch.slot, time);
      applyPose(batch.group, state);
      batch.group.visible = state.visible;
      batch.group.userData.owner = state.owner?.id ?? 'station';
      batch.group.userData.stage = state.stage;
      if (state.owner) cargo.set(state.owner.id, batch.group);
      const assembly = batch.flow.routes[3],
        assemblyStart = batch.flow.starts[3] + assembly.workStart;
      const assembling =
        state.age >= assemblyStart && state.age < assemblyStart + assembly.work;
      const assemblyProgress = (state.age - assemblyStart) / assembly.work;
      for (const [i, base] of batch.bases.entries()) {
        const progress = ease((assemblyProgress * 3 - i) / 0.85);
        const source = new THREE.Vector3(
          assembly.source.position[0] + 0.4,
          1.43,
          assembly.source.position[2] + (i - 1) * 0.2,
        );
        const destination = new THREE.Vector3(base.x, 0.12, 0)
          .applyQuaternion(batch.group.quaternion)
          .add(batch.group.position);
        base.group.position.copy(source).lerp(destination, progress);
        base.group.position.y += Math.sin(progress * Math.PI) * 0.18;
        base.group.quaternion.copy(batch.group.quaternion);
        base.group.visible = state.visible && state.age >= assemblyStart - 7;
        const p = batch.portions[i];
        p.position.y = mix(0.09, 0.23, progress);
        p.scale.set(
          mix(0.2, batch.flow.product === 'maki' ? 0.08 : 0.22, progress),
          mix(0.12, 0.06, progress),
          mix(0.4, batch.flow.product === 'maki' ? 0.09 : 0.3, progress),
        );
        if (assembling && Math.min(2, Math.floor(assemblyProgress * 3)) === i)
          handTargets.set(assembly.id, base.group.position);
      }
      const packing = batch.flow.routes[4],
        packingStart = batch.flow.starts[4] + packing.workStart;
      const seal = ease((state.age - packingStart) / packing.work);
      const lidDestination = new THREE.Vector3(0, 0.28, 0)
        .applyQuaternion(batch.group.quaternion)
        .add(batch.group.position);
      batch.lid.position
        .set(
          packing.source.position[0] + 0.48,
          packing.source.position[1] + 0.07,
          packing.source.position[2],
        )
        .lerp(lidDestination, seal);
      batch.lid.position.y += Math.sin(seal * Math.PI) * 0.2;
      batch.lid.quaternion.copy(batch.group.quaternion);
      batch.lid.visible = state.visible && state.age >= packingStart - 5;
      if (state.age >= packingStart && state.age < packingStart + packing.work)
        handTargets.set(packing.id, batch.lid.position);
    }
    for (const item of vegetableTrays) {
      const state = sampleRoute(item.route, time);
      const afterDelivery =
        state.time >= item.route.dropoff && state.time < item.route.returnedAt!;
      // The same tote returns to prep after unloading. Returning workers never
      // get a second, disconnected visual copy of the delivered tote.
      const at = afterDelivery ? item.route.destination : item.route.source;
      const p = state.cargo ?? { position: at.position, heading: at.heading };
      applyPose(item.group, p);
      item.group.userData.owner = state.cargo ? item.route.id : 'station';
      item.portions.forEach((part) => {
        part.scale.y = afterDelivery ? 0.05 : 0.12;
      });
      if (state.cargo) cargo.set(item.route.id, item.group);
    }
    workers.forEach(({ route, rig }) => {
      const state = sampleRoute(route, time),
        action = state.action;
      applyPose(rig.group, state);
      rig.group.visible = state.visible;
      rig.group.userData.action = action?.kind ?? 'wait';
      const stride = state.walking
        ? Math.sin((state.time - action!.start) * 9) * 0.42
        : 0;
      rig.legs[0].rotation.x = stride;
      rig.legs[1].rotation.x = -stride;
      rig.body.updateWorldMatrix(true, false);
      const object = cargo.get(route.id);
      rig.arms.forEach((arm, side) => {
        const sign = side ? 1 : -1;
        arm.target.set(sign * 0.3, 0.61, 0.04 + stride * sign * 0.24);
        if (object) {
          target
            .set(sign * 0.45, 0.025, 0)
            .applyQuaternion(object.quaternion)
            .add(object.position);
          rig.body.worldToLocal(target);
          const reach =
            action?.kind === 'pickup' ? ease(state.progress / 0.2) : 1;
          const release =
            action?.kind === 'dropoff' && route.product !== 'vegetables'
              ? 1 - ease((state.progress - 0.8) / 0.2)
              : 1;
          arm.target.lerp(target, reach * release);
        } else if (action?.kind === 'work') {
          const handled = handTargets.get(route.id);
          if (handled && !side) target.copy(handled);
          else {
            const station = action.dock ?? route.source;
            target.set(
              station.position[0] + sign * 0.18,
              station.position[1] +
                0.16 +
                Math.abs(Math.sin(state.progress * Math.PI * 8)) * 0.07,
              station.position[2],
            );
          }
          rig.body.worldToLocal(target);
          arm.target.lerp(
            target,
            ease(state.progress / 0.1) *
              (1 - ease((state.progress - 0.9) / 0.1)),
          );
        }
        direction.copy(arm.target).sub(arm.origin);
        const distance = Math.min(0.838, Math.max(0.001, direction.length()));
        direction.normalize();
        bend.copy(down).addScaledVector(direction, -down.dot(direction));
        if (bend.lengthSq() < 0.001) bend.set(0, 0, 1);
        bend.normalize();
        joint
          .copy(arm.origin)
          .addScaledVector(direction, distance / 2)
          .addScaledVector(bend, Math.sqrt(0.1764 - (distance * distance) / 4));
        arm.shoulder.quaternion.setFromUnitVectors(
          down,
          target.copy(joint).sub(arm.origin).normalize(),
        );
        arm.elbow.position.copy(joint);
        arm.elbow.quaternion.setFromUnitVectors(
          down,
          target.copy(arm.target).sub(joint).normalize(),
        );
        arm.hand.position.copy(arm.target);
      });
    });
    root.userData.productionTime = time;
    root.userData.workers = workers.length;
    root.userData.movingTrays = cargo.size;
  }
  update(0);
  return {
    root,
    debugRoutes,
    objects,
    update,
    period: PRODUCTION_PERIOD,
    rate: MOTION.demoRate,
    dispose() {
      [
        boxGeometry,
        roundGeometry,
        capGeometry,
        shadowGeometry,
        ...routeGeometries,
      ].forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}
