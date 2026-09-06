import * as THREE from 'three';
import type { ZoneId } from './telemetry';

// Metres in a 5.3 × 5.5 m cell. Every assembly shares this small geometry kit.
// Food shapes are deliberately enlarged for a readable operations schematic.
export function createFacilityKit() {
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    sphere: new THREE.SphereGeometry(0.5, 16, 10),
  };
  const makeMaterial = (color: string, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const materials = {
    steel: makeMaterial('#b2c4c0', 0.7, 0.34),
    enamel: makeMaterial('#dce5d9', 0.2),
    dark: makeMaterial('#1d3536'),
    belt: makeMaterial('#526d65'),
    rice: makeMaterial('#fff1d2'),
    salmon: makeMaterial('#f28c69'),
    fat: makeMaterial('#ffd5b0'),
    tuna: makeMaterial('#b75059'),
    nori: makeMaterial('#183b2b'),
    cucumber: makeMaterial('#579759'),
    avocado: makeMaterial('#c8db72'),
    board: makeMaterial('#adc6b4'),
    glass: new THREE.MeshStandardMaterial({
      color: '#d8f5eb',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      metalness: 0.15,
      roughness: 0.18,
    }),
  };
  function shape(
    parent: THREE.Object3D,
    geometry: keyof typeof geometries,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(geometries[geometry], material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }
  const box = (
    g: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
  ) => shape(g, 'box', x, y, z, w, h, d, mat);

  function bench(g: THREE.Object3D, z: number, accent: THREE.Material) {
    for (const x of [-1.8, 1.8])
      for (const dz of [-0.48, 0.48])
        box(g, x, 0.62, z + dz, 0.09, 1.1, 0.09, materials.steel);
    box(g, 0, 1.2, z, 4.1, 0.14, 1.4, materials.steel);
    box(g, 0, 0.45, z, 3.8, 0.08, 1.05, accent);
    box(g, 0, 1.38, z - 0.66, 4.1, 0.25, 0.06, materials.enamel);
  }
  function conveyor(g: THREE.Object3D, z: number, accent: THREE.Material) {
    bench(g, z, accent);
    box(g, 0, 1.3, z, 4.3, 0.09, 1.1, materials.belt);
    for (const dz of [-0.62, 0.62])
      box(g, 0, 1.38, z + dz, 4.4, 0.15, 0.08, accent);
    for (let x = -2; x <= 2; x += 0.5)
      box(g, x, 1.355, z, 0.025, 0.015, 1.05, materials.steel);
  }
  function maki(g: THREE.Object3D, x: number, y: number, z: number, s = 1) {
    shape(
      g,
      'cylinder',
      x,
      y + 0.2 * s,
      z,
      0.5 * s,
      0.4 * s,
      0.5 * s,
      materials.nori,
    );
    shape(
      g,
      'cylinder',
      x,
      y + 0.405 * s,
      z,
      0.42 * s,
      0.025 * s,
      0.42 * s,
      materials.rice,
    );
    box(
      g,
      x - 0.06 * s,
      y + 0.425 * s,
      z,
      0.14 * s,
      0.035 * s,
      0.18 * s,
      materials.salmon,
    );
    box(
      g,
      x + 0.09 * s,
      y + 0.43 * s,
      z,
      0.09 * s,
      0.035 * s,
      0.16 * s,
      materials.avocado,
    );
  }
  function nigiri(g: THREE.Object3D, x: number, y: number, z: number) {
    shape(g, 'sphere', x, y + 0.16, z, 0.78, 0.32, 0.43, materials.rice);
    shape(g, 'sphere', x, y + 0.32, z, 0.86, 0.18, 0.49, materials.salmon);
    for (const dx of [-0.2, 0, 0.2]) {
      const stripe = box(
        g,
        x + dx,
        y + 0.409,
        z,
        0.04,
        0.016,
        0.32,
        materials.fat,
      );
      stripe.rotation.y = -0.35;
    }
  }
  function fillet(g: THREE.Object3D, x: number, y: number, z: number) {
    shape(g, 'sphere', x, y + 0.12, z, 1.35, 0.24, 0.56, materials.salmon);
    for (const dx of [-0.4, -0.2, 0, 0.2, 0.4]) {
      const stripe = box(
        g,
        x + dx,
        y + 0.225,
        z,
        0.035,
        0.014,
        0.33,
        materials.fat,
      );
      stripe.rotation.y = -0.5;
    }
  }
  function buildZone(id: ZoneId, accent: THREE.Material) {
    const group = new THREE.Group();
    group.name = `production-${id}`;
    if (id === 'A1') {
      for (const x of [-1.4, 1.4]) {
        box(group, x, 1.48, -1.35, 2.2, 2.8, 1.5, materials.enamel);
        box(group, x, 1.45, -0.565, 1.92, 2.35, 0.08, materials.dark);
        for (const y of [0.6, 1.3, 2]) {
          box(group, x, y, -0.5, 1.82, 0.06, 0.72, materials.steel);
          box(
            group,
            x - 0.42,
            y + 0.15,
            -0.5,
            0.65,
            0.22,
            0.5,
            materials.salmon,
          );
          box(group, x + 0.42, y + 0.15, -0.5, 0.65, 0.22, 0.5, materials.tuna);
        }
        box(group, x, 1.5, -0.11, 1.93, 2.34, 0.03, materials.glass);
        box(group, x + 0.74, 1.5, -0.04, 0.045, 0.65, 0.07, materials.steel);
        box(group, x, 2.79, -0.565, 1.8, 0.13, 0.08, accent);
      }
      bench(group, 1.55, accent);
      for (const x of [-1.1, 1.1]) {
        box(group, x, 1.31, 1.55, 1.6, 0.1, 0.95, materials.dark);
        fillet(group, x, 1.37, 1.55);
      }
    } else if (id === 'A2') {
      for (const z of [-1.4, 1.4]) {
        bench(group, z, accent);
        box(group, -1, 1.3, z, 1.5, 0.06, 1, materials.board);
        for (const dz of [-0.26, 0, 0.26])
          shape(
            group,
            'sphere',
            -1,
            1.45,
            z + dz,
            1.15,
            0.21,
            0.21,
            materials.cucumber,
          );
        box(group, 1.05, 1.36, z, 1.35, 0.22, 0.95, materials.enamel);
        for (const x of [0.65, 1.05, 1.45])
          for (const dz of [-0.22, 0.22])
            shape(
              group,
              'sphere',
              x,
              1.52,
              z + dz,
              0.3,
              0.18,
              0.38,
              materials.avocado,
            );
      }
    } else if (id === 'B1') {
      for (const z of [-1.4, 1.4]) {
        bench(group, z, accent);
        for (const x of [-1.15, 1.15]) {
          box(group, x, 1.3, z, 1.6, 0.06, 1, materials.board);
          fillet(group, x, 1.34, z);
          box(
            group,
            x + 0.1,
            1.35,
            z + 0.44,
            0.7,
            0.025,
            0.09,
            materials.steel,
          );
          box(group, x + 0.58, 1.35, z + 0.44, 0.27, 0.04, 0.1, materials.dark);
        }
      }
    } else if (id === 'B2') {
      conveyor(group, 1.2, accent);
      for (const x of [-1.65, -0.55, 0.55, 1.65])
        for (const z of [0.92, 1.48]) maki(group, x, 1.38, z);
      bench(group, -1.45, accent);
      for (const x of [-1.25, 1.25]) {
        box(group, x, 1.32, -1.45, 1.65, 0.07, 0.96, materials.avocado);
        box(group, x, 1.38, -1.45, 1.45, 0.035, 0.8, materials.nori);
        box(group, x, 1.42, -1.45, 1.28, 0.04, 0.64, materials.rice);
        box(group, x, 1.47, -1.45, 1.22, 0.08, 0.14, materials.salmon);
      }
    } else if (id === 'C1') {
      for (const z of [-1.4, 1.4]) {
        bench(group, z, accent);
        box(group, 0, 1.31, z, 3.8, 0.08, 1.06, materials.dark);
        for (const x of [-1.25, 0, 1.25])
          for (const dz of [-0.27, 0.27]) nigiri(group, x, 1.36, z + dz);
      }
    } else {
      conveyor(group, 1.3, accent);
      for (const x of [-1.35, 0, 1.35]) {
        box(group, x, 1.42, 1.3, 1.13, 0.16, 0.93, materials.dark);
        for (const dx of [-0.25, 0.25])
          for (const dz of [-0.22, 0.22])
            maki(group, x + dx, 1.5, 1.3 + dz, 0.72);
        if (x > 0) box(group, x, 1.78, 1.3, 1.12, 0.11, 0.93, materials.glass);
      }
      // Chiller and tray sealer: distinct silhouettes beside the packing belt.
      box(group, -1.3, 1.3, -1.35, 1.9, 2.4, 1.7, materials.enamel);
      box(group, -1.3, 1.45, -0.47, 1.6, 1.9, 0.06, materials.steel);
      box(group, -0.68, 1.45, -0.4, 0.06, 0.7, 0.07, materials.dark);
      for (const y of [2.02, 2.15, 2.28])
        box(group, -1.3, y, -0.42, 1.1, 0.04, 0.025, materials.dark);
      box(group, 1.22, 0.78, -1.35, 1.8, 1.4, 1.65, accent);
      box(group, 1.22, 1.53, -1.35, 2, 0.1, 1.8, materials.steel);
      box(group, 1.22, 2.07, -1.72, 1.8, 0.95, 0.8, materials.enamel);
      box(group, 1.22, 2.12, -1.3, 0.65, 0.33, 0.04, materials.dark);
      box(group, 1.22, 1.64, -0.96, 1.1, 0.12, 0.72, materials.dark);
    }
    return group;
  }
  return {
    buildZone,
    dispose() {
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
