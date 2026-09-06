'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RotateCcw, Minus, Plus } from 'lucide-react';
import { ZONES, colorFor, type Metric, type ZoneId } from '@/lib/telemetry';

export type ZoneState = {
  id: ZoneId;
  temperature: number | null;
  debt: number;
};
type Props = {
  zones: ZoneState[];
  selected: ZoneId;
  metric: Metric;
  onSelect: (id: ZoneId) => void;
};

export default function Warehouse(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const update = useRef<() => void>(() => {});
  const cameraAction = useRef<(action: string) => void>(() => {});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    live.current = props;
    update.current();
  }, [props]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      // oxlint-disable-next-line react/react-compiler -- WebGL availability is discovered by initializing this external renderer, then the accessible fallback is shown.
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive warehouse schematic. Use the zone buttons below to select a zone with the keyboard.',
    );
    renderer.domElement.setAttribute('role', 'img');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 150);
    camera.position.set(23, 26, 29);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.minZoom = 0.75;
    controls.maxZoom = 1.7;
    controls.zoomSpeed = 0.6;
    controls.update();
    controls.saveState();
    scene.add(new THREE.HemisphereLight('#d5efff', '#2e4547', 2.6));
    const key = new THREE.DirectionalLight('#e4ffdc', 3.2);
    key.position.set(-8, 18, 10);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#6aa9c5', 1.8);
    fill.position.set(12, 10, -12);
    scene.add(fill);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    geometries.push(boxGeo);
    const material = (color: string, metalness = 0.15) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.68,
        metalness,
      });
      materials.push(m);
      return m;
    };
    const floor = material('#233138');
    const wall = material('#485d61');
    const steel = material('#69837f', 0.45);
    const pallet = material('#6b7966');
    const packages = material('#88988b');
    function box(
      group: THREE.Object3D,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
    ) {
      const b = new THREE.Mesh(boxGeo, mat);
      b.position.set(x, y, z);
      b.scale.set(w, h, d);
      group.add(b);
      return b;
    }
    box(scene, 0, -0.38, 0, 23, 0.6, 17, floor);
    box(scene, 0, -0.72, 0, 23.4, 0.14, 17.4, material('#111d24'));
    box(scene, 0, 0.65, -8.35, 23, 1.3, 0.2, wall);
    box(scene, -11.35, 0.65, 0, 0.2, 1.3, 17, wall);
    for (let x = -10; x < 11; x += 2)
      box(scene, x, 0.01, 0, 0.018, 0.015, 16, material('#35454b'));
    for (let z = -7; z < 8; z += 2)
      box(scene, 0, 0.01, z, 22, 0.015, 0.018, material('#35454b'));
    // Loading bays and floor markings give the heat source a physical location.
    for (let n = 0; n < 3; n++) {
      box(
        scene,
        5.15 + n * 0.85,
        0.025,
        7.8,
        0.45,
        0.025,
        0.9,
        material('#b3b978'),
      );
      box(scene, 5.15 + n * 0.85, 0.14, 8.4, 0.6, 0.25, 0.35, steel);
    }
    for (let n = 0; n < 11; n++)
      box(
        scene,
        -9.5 + n * 1.9,
        0.025,
        0,
        0.75,
        0.02,
        0.055,
        material('#92a29a'),
      );
    const picks: THREE.Object3D[] = [];
    const groups = ZONES.map((zone) => {
      const group = new THREE.Group();
      group.position.set(zone.x, 0, zone.z);
      group.userData.zone = zone.id;
      scene.add(group);
      const tint = material('#73cbb9');
      tint.transparent = true;
      tint.opacity = 0.35;
      tint.emissive.set('#73cbb9');
      tint.emissiveIntensity = 0.12;
      const plate = box(group, 0, 0.04, 0, 5.3, 0.1, 5.5, tint);
      picks.push(plate);
      const edgeGeo = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(5.35, 0.12, 5.55),
      );
      geometries.push(edgeGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: '#73cbb9',
        transparent: true,
        opacity: 0.8,
      });
      materials.push(edgeMat);
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.y = 0.12;
      group.add(edge);
      const rackTint = material('#659f93');
      rackTint.emissiveIntensity = 0.08;
      for (const row of [-1.3, 1.3]) {
        for (const x of [-2.1, 0, 2.1])
          for (const z of [-0.51, 0.51])
            box(group, x, 1.35, row + z, 0.075, 2.65, 0.075, steel);
        for (const y of [0.25, 1.22, 2.19]) {
          box(group, 0, y, row, 4.3, 0.1, 1.17, rackTint);
          for (let c = 0; c < 4; c++) {
            box(group, -1.65 + c * 1.1, y + 0.13, row, 0.85, 0.12, 0.9, pallet);
            box(
              group,
              -1.65 + c * 1.1,
              y + 0.5,
              row,
              0.78,
              0.62,
              0.8,
              packages,
            );
          }
        }
      }
      const sensorMat = material('#c8f2c2');
      sensorMat.emissive.set('#c8f2c2');
      sensorMat.emissiveIntensity = 0.5;
      for (const x of [-2.45, 2.45])
        for (const z of [-2.45, 2.45])
          box(group, x, 0.22, z, 0.13, 0.2, 0.13, sensorMat);
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 152;
      const texture = new THREE.CanvasTexture(canvas);
      textures.push(texture);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
      });
      materials.push(spriteMat);
      const label = new THREE.Sprite(spriteMat);
      label.position.set(0, 4, 0);
      label.scale.set(4.6, 1.82, 1);
      label.renderOrder = 5;
      group.add(label);
      picks.push(...group.children.filter((c) => c instanceof THREE.Mesh));
      return { id: zone.id, tint, rackTint, edgeMat, canvas, texture };
    });
    let disposed = false;
    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };
    const recolor = () => {
      for (const zone of groups) {
        const data = live.current.zones.find((z) => z.id === zone.id)!;
        const color = colorFor(
          data.temperature,
          data.debt,
          live.current.metric,
        );
        const selected = live.current.selected === zone.id;
        zone.tint.color.set(color);
        zone.tint.emissive.set(color);
        zone.tint.opacity = selected ? 0.5 : 0.24;
        zone.rackTint.color.set(color);
        zone.rackTint.emissive.set(color);
        zone.edgeMat.color.set(selected ? '#dcf7b2' : color);
        zone.edgeMat.opacity = selected ? 1 : 0.6;
        const ctx = zone.canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 384, 152);
        ctx.fillStyle = selected ? '#243d36' : '#102128';
        ctx.beginPath();
        ctx.roundRect(5, 5, 374, 140, 12);
        ctx.fill();
        ctx.strokeStyle = selected ? '#c2f878' : '#49646a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = selected ? '#c2f878' : '#b4c5c9';
        ctx.font = '500 29px Arial';
        ctx.fillText(zone.id, 23, 49);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(350, 39, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eef4ef';
        ctx.font = '500 41px Arial';
        ctx.fillText(
          data.temperature === null
            ? 'No data'
            : live.current.metric === 'debt'
              ? `${Math.round(data.debt)} °C·min`
              : `${data.temperature.toFixed(1)} °C`,
          23,
          111,
        );
        zone.texture.needsUpdate = true;
      }
      render();
    };
    update.current = recolor;
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      const a = w / h;
      const half = Math.max(11.2, 16 / a);
      camera.left = -half * a;
      camera.right = half * a;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    controls.addEventListener('change', render);
    cameraAction.current = (action) => {
      if (action === 'reset') controls.reset();
      else {
        camera.zoom = THREE.MathUtils.clamp(
          camera.zoom * (action === 'in' ? 1.16 : 1 / 1.16),
          0.75,
          1.7,
        );
        camera.updateProjectionMatrix();
      }
      render();
    };
    let downX = 0,
      downY = 0;
    const down = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(picks, false)[0];
      if (hit) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.zone) object = object.parent;
        if (object?.userData.zone) live.current.onSelect(object.userData.zone);
      }
    };
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    resize();
    recolor();
    return () => {
      disposed = true;
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      update.current = () => {};
      cameraAction.current = () => {};
    };
  }, []);
  return (
    <div className="warehouse-wrap">
      <div
        className="warehouse-canvas"
        ref={host}
        style={failed ? { visibility: 'hidden' } : undefined}
      />
      {failed ? (
        <div className="warehouse-fallback">
          <BoxFallback />
          <p>3D view is unavailable on this device.</p>
          <span>Explore every zone using the buttons below.</span>
        </div>
      ) : (
        <>
          <span className="map-caption">
            NORTH DOCK <span>/</span> LEVEL 01
          </span>
          <div className="camera-buttons">
            <button
              onClick={() => cameraAction.current('out')}
              aria-label="Zoom out"
            >
              <Minus size={16} />
            </button>
            <button
              onClick={() => cameraAction.current('in')}
              aria-label="Zoom in"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => cameraAction.current('reset')}
              aria-label="Reset warehouse view"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <p className="orbit-hint">
            Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Select a
            zone
          </p>
        </>
      )}
    </div>
  );
}
function BoxFallback() {
  return <span className="fallback-symbol">3D</span>;
}
