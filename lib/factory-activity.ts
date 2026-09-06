import * as THREE from 'three';
import {
  DOCKS,
  PRODUCTION,
  WORKER_HOME,
  ease,
  mix,
  sampleObject,
  sampleWorker,
  type Pose,
  type WorkerId,
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
  const objects = new Map<string, THREE.Group>();
  const fishPieces = new Map<string, THREE.Mesh[]>();
  for (const id of Object.keys(PRODUCTION.initial)) {
    const group = new THREE.Group();
    group.name = id;
    group.userData.physicalObject = true;
    objects.set(id, group);
    root.add(group);
    if (id.endsWith('-tray')) {
      box(group, trayMat, 0, 0, 0, 0.98, 0.055, 0.62);
      for (const z of [-0.3, 0.3])
        box(group, trayMat, 0, 0.045, z, 0.98, 0.06, 0.03);
      for (const x of [-0.5, 0.5])
        box(group, steel, x, 0.035, 0, 0.055, 0.045, 0.22);
      if (id !== 'vegetable-tray')
        fishPieces.set(
          id,
          [-0.27, 0, 0.27].map((x) =>
            mesh(group, roundGeometry, fishMat, x, 0.09, 0, 0.21, 0.12, 0.44),
          ),
        );
    } else if (id.includes('-nori-')) {
      mesh(group, capGeometry, nori, 0, 0, 0, 0.25, 0.055, 0.25);
    } else if (id.includes('-rice-')) {
      mesh(
        group,
        id.startsWith('maki') ? capGeometry : roundGeometry,
        riceMat,
        0,
        0,
        0,
        0.205,
        0.105,
        id.startsWith('maki') ? 0.205 : 0.34,
      );
    } else if (id.includes('-vegetable-')) {
      box(group, green, 0, 0, 0, 0.085, 0.09, 0.15);
    } else {
      box(group, glass, 0, 0, 0, 0.98, 0.035, 0.62);
      for (const z of [-0.29, 0.29])
        box(group, steel, 0, -0.06, z, 0.97, 0.12, 0.022);
    }
  }
  // A component retains its identity when it becomes part of a finished tray.
  const components = [...objects.keys()]
    .filter((id) => !id.endsWith('-tray'))
    .map((id) => {
      const transfers = PRODUCTION.actions.filter(
        (a) => a.object === id && a.kind === 'transfer',
      );
      const last = transfers[transfers.length - 1];
      const tray = id.startsWith('maki') ? 'maki-tray' : 'nigiri-tray';
      const at = id.endsWith('-lid')
        ? DOCKS.sealer
        : tray === 'maki-tray'
          ? DOCKS.maki
          : DOCKS.nigiri;
      return {
        id,
        tray,
        first: transfers[0].start,
        end: last.end,
        local: new THREE.Vector3(...last.to.position)
          .sub(new THREE.Vector3(...at.position))
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -at.heading),
      };
    });
  const down = new THREE.Vector3(0, -1, 0);
  function worker(index: number, id: WorkerId) {
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
      id === 'store' ? carrierApron : apron,
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
  const workers = Object.keys(WORKER_HOME).map((id, index) => ({
    id: id as WorkerId,
    rig: worker(index, id as WorkerId),
  }));
  const knives = PRODUCTION.actions
    .filter(
      (a) =>
        a.kind === 'work' && (a.worker === 'prep' || a.worker === 'vegetables'),
    )
    .map((action) => {
      const group = new THREE.Group();
      group.name = `knife-${action.object}`;
      root.add(group);
      box(group, trayMat, 0, 0, 0, 0.08, 0.08, 0.18);
      box(group, steel, 0, -0.03, 0.2, 0.022, 0.09, 0.32);
      return {
        group,
        action,
        rest: new THREE.Vector3(
          action.from.position[0] - 0.3,
          1.44,
          action.from.position[2] - 0.57,
        ),
      };
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
  const routeGeometries = PRODUCTION.actions
    .filter((a) => a.kind === 'walk')
    .map((a) => {
      const g = new THREE.BufferGeometry().setFromPoints(
        [a.from, a.to].map(
          (p) => new THREE.Vector3(p.position[0], 0.18, p.position[2]),
        ),
      );
      debugRoutes.add(new THREE.Line(g, lineMaterial));
      return g;
    });
  const direction = new THREE.Vector3(),
    bend = new THREE.Vector3(),
    joint = new THREE.Vector3(),
    target = new THREE.Vector3();
  function applyPose(group: THREE.Group, p: Pose) {
    group.position.set(...p.position);
    group.rotation.set(0, p.heading, 0);
  }
  function update(seconds: number, _deltaSeconds = 0) {
    const time = Math.max(0, Math.min(seconds, PRODUCTION.duration));
    knives.forEach((tool) => {
      tool.group.position.copy(tool.rest);
      tool.group.rotation.set(0, Math.PI, 0);
    });
    objects.forEach((g, id) => {
      applyPose(g, sampleObject(id, time));
      g.userData.owner = 'station';
    });
    for (const part of components) {
      const g = objects.get(part.id)!;
      if (time >= part.end) {
        const parent = objects.get(part.tray)!;
        g.position
          .copy(part.local)
          .applyQuaternion(parent.quaternion)
          .add(parent.position);
        g.quaternion.copy(parent.quaternion);
        g.userData.owner = part.tray;
      } else if (part.id.includes('-vegetable-') && time < part.first) {
        const tray = objects.get('vegetable-tray')!,
          i = Number(part.id.at(-1));
        g.position
          .set(-(i - 1) * 0.24, 0.1, 0)
          .applyQuaternion(tray.quaternion)
          .add(tray.position);
        g.quaternion.copy(tray.quaternion);
        g.userData.owner = 'vegetable-tray';
      }
    }
    for (const [id, pieces] of fishPieces) {
      const cutting = PRODUCTION.actions.find(
        (a) => a.object === id && a.label === 'Portion salmon',
      )!;
      const assembly = PRODUCTION.actions.find(
        (a) =>
          a.object === id &&
          (a.label === 'Roll and portion maki' ||
            a.label === 'Shape and top nigiri'),
      )!;
      const cut = ease((time - cutting.start) / (cutting.end - cutting.start));
      const made = ease(
        (time - assembly.start) / (assembly.end - assembly.start),
      );
      pieces.forEach((p) => {
        p.scale.set(
          mix(0.21, id === 'maki-tray' ? 0.085 : 0.22, made),
          mix(0.12, 0.06, made),
          mix(mix(0.44, 0.24, cut), id === 'maki-tray' ? 0.09 : 0.3, made),
        );
        p.position.y = mix(0.09, 0.2, made);
      });
    }
    workers.forEach(({ id, rig }) => {
      const state = sampleWorker(id, time),
        a = state.action;
      applyPose(rig.group, state);
      rig.group.userData.action = a?.label ?? 'Waiting at station';
      const stride = state.walking
        ? Math.sin((time - a!.start) * MOTION_STRIDE) * 0.38
        : 0;
      rig.legs[0].rotation.x = stride;
      rig.legs[1].rotation.x = -stride;
      // Keep the torso and held objects stable; secondary motion belongs to legs.
      rig.body.updateWorldMatrix(true, false);
      let carrying: string | undefined;
      for (const previous of PRODUCTION.actions) {
        if (previous.worker !== id || previous.start > time) continue;
        if (previous.kind === 'transfer' && previous.end <= time)
          carrying = previous.label === 'Pick up' ? previous.object : undefined;
      }
      const objectId = a?.kind === 'transfer' ? a.object : carrying;
      const object = objectId ? objects.get(objectId) : undefined;
      const handling = a?.kind === 'transfer';
      const tool = knives.find((knife) => knife.action === a);
      rig.arms.forEach((arm, side) => {
        const sign = side ? 1 : -1;
        arm.target.set(sign * 0.3, 0.61, 0.05 + stride * sign * 0.22);
        if (object) {
          const large =
            objectId!.endsWith('-tray') || objectId!.endsWith('-lid');
          target
            .set(large ? sign * 0.48 : sign * 0.085, 0.025, 0)
            .applyQuaternion(object.quaternion)
            .add(object.position);
          rig.body.worldToLocal(target);
          const reach =
            handling && a!.label === 'Pick up' ? ease(state.progress / 0.2) : 1;
          const release =
            handling && a!.label === 'Place on station'
              ? 1 - ease((state.progress - 0.8) / 0.2)
              : 1;
          arm.target.lerp(target, reach * release);
          object.userData.owner = id;
        } else if (a?.kind === 'work') {
          const tray = objects.get(a.object!)!;
          target
            .set(
              sign * 0.18,
              0.13 +
                (side
                  ? Math.abs(Math.sin(state.progress * Math.PI * 8)) * 0.1
                  : 0),
              0,
            )
            .applyQuaternion(tray.quaternion)
            .add(tray.position);
          rig.body.worldToLocal(target);
          if (tool && side) {
            const rest = rig.body.worldToLocal(tool.rest.clone());
            if (state.progress < 0.08)
              arm.target.lerp(rest, ease(state.progress / 0.08));
            else if (state.progress > 0.92)
              arm.target.lerp(rest, 1 - ease((state.progress - 0.92) / 0.08));
            else
              arm.target
                .copy(rest)
                .lerp(
                  target,
                  ease((state.progress - 0.08) / 0.12) *
                    (1 - ease((state.progress - 0.8) / 0.12)),
                );
          } else
            arm.target.lerp(
              target,
              ease(state.progress / 0.12) *
                (1 - ease((state.progress - 0.88) / 0.12)),
            );
        }
        // Two-bone IK puts gloves on handles/ingredients, rather than waving near them.
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
      if (tool && state.progress >= 0.08 && state.progress <= 0.92)
        rig.body.localToWorld(
          tool.group.position.copy(rig.arms[1].hand.position),
        );
    });
    root.userData.productionTime = time;
    root.userData.complete = time >= PRODUCTION.duration;
  }
  update(0);
  return {
    root,
    debugRoutes,
    update,
    objects,
    duration: PRODUCTION.duration,
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
const MOTION_STRIDE = 8.5;
