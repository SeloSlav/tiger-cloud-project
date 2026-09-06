import * as THREE from 'three';
import type { ZoneId } from './telemetry';

// Equipment owns only furniture. Every tray, ingredient, lid, and working tool
// belongs to factory-activity, which is the sole owner of product movement.
export function createFacilityKit() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = (color: string, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const materials = {
    steel: material('#b2c4c0', 0.7, 0.34),
    enamel: material('#dce5d9', 0.2),
    dark: material('#1d3536'),
    board: material('#adc6b4'),
    bamboo: material('#c8b875'),
  };
  function box(
    g: THREE.Object3D,
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    g.add(mesh);
    return mesh;
  }
  function bench(g: THREE.Object3D, z: number, accent: THREE.Material) {
    for (const x of [-1.8, 1.8])
      for (const dz of [-0.48, 0.48])
        box(g, 'bench-leg', x, 0.62, z + dz, 0.09, 1.1, 0.09, materials.steel);
    box(g, 'stationary-worktop', 0, 1.2, z, 4.1, 0.14, 1.4, materials.steel);
    box(g, 'lower-shelf', 0, 0.45, z, 3.8, 0.08, 1.05, accent);
    box(g, 'backsplash', 0, 1.38, z - 0.66, 4.1, 0.25, 0.06, materials.enamel);
  }
  function cabinet(
    g: THREE.Object3D,
    x: number,
    accent: THREE.Material,
    packing = false,
  ) {
    // Open-front refrigerated shelving makes pickup and final inventory visible.
    box(g, 'chiller-back', x, 1.48, -1.9, 2.0, 2.8, 0.16, materials.enamel);
    for (const dx of [-1, 1])
      box(
        g,
        'chiller-side',
        x + dx,
        1.48,
        -1.25,
        0.12,
        2.8,
        1.4,
        materials.enamel,
      );
    box(g, 'chiller-header', x, 2.82, -1.22, 2.1, 0.16, 1.5, accent);
    for (const y of packing ? [0.6, 1.28, 1.68, 2.25] : [0.6, 1.28, 2.05])
      box(g, 'chilled-shelf', x, y, -0.95, 1.9, 0.06, 1.05, materials.steel);
  }
  function buildZone(id: ZoneId, accent: THREE.Material) {
    const g = new THREE.Group();
    g.name = `production-${id}`;
    if (id === 'A1') {
      cabinet(g, -1.4, accent);
      cabinet(g, 1.4, accent);
      bench(g, 1.55, accent);
    } else if (id === 'C2') {
      bench(g, 1.3, accent);
      cabinet(g, -1.3, accent, true);
      box(g, 'sealer-base', 1.22, 0.65, -1.35, 1.8, 1.14, 1.65, accent);
      box(g, 'sealer-worktop', 1.22, 1.27, -1.35, 2, 0.1, 1.8, materials.steel);
      box(
        g,
        'sealer-housing',
        1.22,
        2.07,
        -1.72,
        1.8,
        0.95,
        0.8,
        materials.enamel,
      );
      box(
        g,
        'sealer-display',
        1.22,
        2.12,
        -1.3,
        0.65,
        0.33,
        0.04,
        materials.dark,
      );
      box(g, 'sealer-pad', 1.22, 1.36, -0.68, 1.05, 0.08, 0.72, materials.dark);
    } else {
      for (const z of [-1.4, 1.4]) {
        bench(g, z, accent);
        for (const x of [-1.05, 1.05]) {
          box(
            g,
            id === 'B2' ? 'rolling-mat' : 'cutting-board',
            x,
            1.3,
            z + 0.15,
            1.65,
            0.055,
            1.12,
            id === 'B2' ? materials.bamboo : materials.board,
          );
          if (id === 'B2')
            for (let dx = -0.7; dx < 0.8; dx += 0.14)
              box(
                g,
                'bamboo-slat',
                x + dx,
                1.332,
                z + 0.15,
                0.018,
                0.009,
                1.1,
                materials.board,
              );
        }
      }
    }
    return g;
  }
  return {
    buildZone,
    dispose() {
      geometry.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
