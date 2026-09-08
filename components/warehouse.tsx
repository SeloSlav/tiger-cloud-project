'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  RotateCcw,
  Minus,
  Plus,
  Play,
  Pause,
  ArrowLeft,
  ListRestart,
} from 'lucide-react';
import { ZONES, colorFor, type Metric, type ZoneId } from '@/lib/telemetry';
import { createFacilityKit } from '@/lib/facility-scene';
import { createFactoryActivity } from '@/lib/factory-activity';
import {
  CAMERA,
  cameraEase,
  facilityFrustum,
  facilityShot,
} from '@/lib/facility-camera';

const subscribeMotion = (change: () => void) => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
};
const motionSnapshot = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const serverMotionSnapshot = () => false;

export type ZoneState = {
  id: ZoneId;
  temperature: number | null;
  debt: number;
};
type Props = {
  zones: ZoneState[];
  focusedZone: ZoneId | null;
  focusRevision: number;
  onOverview: () => void;
  metric: Metric;
  onSelect: (id: ZoneId) => void;
};

export default function Warehouse(props: Props) {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    serverMotionSnapshot,
  );
  const [motion, setMotion] = useState<'auto' | 'on' | 'off'>('auto');
  const activityRunning =
    motion === 'on' || (motion === 'auto' && !reducedMotion);
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ ...props, activityRunning, reducedMotion });
  const update = useRef<() => void>(() => {});
  const cameraAction = useRef<(action: string) => void>(() => {});
  const restartProduction = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    live.current = { ...props, activityRunning, reducedMotion };
    update.current();
  }, [props, activityRunning, reducedMotion]);
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
      'Nori Works sushi production facility. Workers pick up ingredients, carry trays from storage through preparation and assembly, then pack and chill the sushi. Keyboard zone controls below.',
    );
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 150);
    camera.position.set(23, 26, 29);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.enableDamping = false;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.minZoom = CAMERA.minZoom;
    controls.maxZoom = CAMERA.maxZoom;
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
    const facility = createFacilityKit();
    const activity = createFactoryActivity();
    scene.add(activity.root);
    const sceneParams = new URLSearchParams(window.location.search);
    activity.debugRoutes.visible = sceneParams.has('scene-debug');
    const inspectionTime = sceneParams.get('scene-time');
    const fixedTime =
      inspectionTime !== null && Number.isFinite(Number(inspectionTime))
        ? Math.max(0, Number(inspectionTime))
        : null;
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
    const grout = material('#35454b');
    const markings = material('#92a29a');
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
      box(scene, x, 0.01, 0, 0.018, 0.015, 16, grout);
    for (let z = -7; z < 8; z += 2)
      box(scene, 0, 0.01, z, 22, 0.015, 0.018, grout);
    // Low service wall and pipework frame the industrial production floor.
    box(scene, 0, 0.38, 8.3, 23, 0.65, 0.16, wall);
    box(scene, 0, 1.43, -8.25, 22, 0.08, 0.08, steel);
    for (let n = 0; n < 11; n++)
      box(scene, -9.5 + n * 1.9, 0.025, 0, 0.75, 0.02, 0.055, markings);
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
      const edgeBox = new THREE.BoxGeometry(5.35, 0.12, 5.55);
      const edgeGeo = new THREE.EdgesGeometry(edgeBox);
      edgeBox.dispose();
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
      const equipmentTint = material('#659f93');
      equipmentTint.emissiveIntensity = 0.08;
      group.add(facility.buildZone(zone.id, equipmentTint));
      const sensorMat = material('#c8f2c2');
      sensorMat.emissive.set('#c8f2c2');
      sensorMat.emissiveIntensity = 0.5;
      for (const x of [-2.45, 2.45])
        for (const z of [-2.45, 2.45])
          box(group, x, 0.22, z, 0.13, 0.2, 0.13, sensorMat);
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 176;
      const texture = new THREE.CanvasTexture(canvas);
      textures.push(texture);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
      });
      materials.push(spriteMat);
      const label = new THREE.Sprite(spriteMat);
      label.position.set(0, 4.1, 0);
      label.scale.set(4.6, 2.1, 1);
      label.renderOrder = 5;
      group.add(label);
      picks.push(label);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child !== plate) picks.push(child);
      });
      return {
        id: zone.id,
        name: zone.name,
        tint,
        equipmentTint,
        edgeMat,
        canvas,
        texture,
        label,
        plate,
        edge,
      };
    });
    let disposed = false;
    let contextLost = false;
    let onScreen = true;
    let aspect = 1;
    let frame = 0;
    let previousFrame = 0;
    let previousRender = 0;
    let seconds = fixedTime ?? 0;
    activity.update(seconds, 0);
    let previousActivity = 0;
    let applyingCamera = false;
    let lastFocus = live.current.focusedZone;
    let lastFocusRevision = live.current.focusRevision;
    type Transition = {
      position: THREE.Vector3;
      target: THREE.Vector3;
      zoom: number;
      quaternion: THREE.Quaternion;
      to: ReturnType<typeof facilityShot>;
      elapsed: number;
    };
    let transition: Transition | null = null;
    const render = () => {
      if (!disposed && !contextLost) renderer.render(scene, camera);
    };
    const updateCamera = (
      position: THREE.Vector3,
      target: THREE.Vector3,
      zoom: number,
      quaternion?: THREE.Quaternion,
    ) => {
      camera.position.copy(position);
      controls.target.copy(target);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      applyingCamera = true;
      if (quaternion) camera.quaternion.copy(quaternion);
      else controls.update();
      applyingCamera = false;
    };
    const scratchPosition = new THREE.Vector3(),
      scratchTarget = new THREE.Vector3();
    const scratchQuaternion = new THREE.Quaternion();
    const canAnimate = () =>
      !disposed && !contextLost && onScreen && !document.hidden;
    const wake = () => {
      if (
        !frame &&
        canAnimate() &&
        (transition || (live.current.activityRunning && fixedTime === null))
      )
        frame = requestAnimationFrame(tick);
    };
    function tick(now: number) {
      frame = 0;
      if (!canAnimate()) {
        previousFrame = 0;
        return;
      }
      const delta = previousFrame
        ? Math.min((now - previousFrame) / 1000, 0.05)
        : 0;
      previousFrame = now;
      if (live.current.activityRunning && fixedTime === null) {
        seconds += delta * activity.rate;
      }
      const cameraMoving = transition !== null;
      if (transition) {
        transition.elapsed += delta;
        const t = live.current.reducedMotion
          ? 1
          : Math.min(transition.elapsed / CAMERA.transitionSeconds, 1);
        const eased = cameraEase(t);
        updateCamera(
          scratchPosition.lerpVectors(
            transition.position,
            transition.to.position,
            eased,
          ),
          scratchTarget.lerpVectors(
            transition.target,
            transition.to.target,
            eased,
          ),
          THREE.MathUtils.lerp(transition.zoom, transition.to.zoom, eased),
          t < 1
            ? scratchQuaternion.slerpQuaternions(
                transition.quaternion,
                transition.to.quaternion,
                eased,
              )
            : undefined,
        );
        if (t === 1) transition = null;
      }
      if (cameraMoving || now - previousRender >= 1000 / 30) {
        activity.update(seconds, seconds - previousActivity);
        previousActivity = seconds;
        previousRender = now;
        render();
      }
      if (!transition && !live.current.activityRunning) previousFrame = 0;
      wake();
    }
    const aim = (id: ZoneId | null, immediate = false) => {
      const to = facilityShot(aspect, id);
      if (immediate || live.current.reducedMotion) {
        transition = null;
        updateCamera(to.position, to.target, to.zoom);
        render();
      } else {
        transition = {
          position: camera.position.clone(),
          target: controls.target.clone(),
          zoom: camera.zoom,
          quaternion: camera.quaternion.clone(),
          to,
          elapsed: 0,
        };
        wake();
      }
    };
    const recolor = () => {
      for (const zone of groups) {
        const data = live.current.zones.find((z) => z.id === zone.id)!;
        const color = colorFor(
          data.temperature,
          data.debt,
          live.current.metric,
        );
        const focused = live.current.focusedZone === zone.id;
        const selected = focused;
        const visible = live.current.focusedZone === null || focused;
        zone.label.visible = visible;
        zone.plate.visible = visible;
        zone.edge.visible = visible;
        zone.label.scale.set(focused ? 2.9 : 4.6, focused ? 1.33 : 2.1, 1);
        zone.label.position.set(0, focused ? 3.65 : 4.1, focused ? -1.5 : 0);
        zone.tint.color.set(color);
        zone.tint.emissive.set(color);
        zone.tint.opacity = selected ? 0.5 : 0.24;
        zone.equipmentTint.color.set(color);
        zone.equipmentTint.emissive.set(color);
        zone.edgeMat.color.set(selected ? '#dcf7b2' : color);
        zone.edgeMat.opacity = selected ? 1 : 0.6;
        const ctx = zone.canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 384, 176);
        ctx.fillStyle = selected ? '#243d36' : '#102128';
        ctx.beginPath();
        ctx.roundRect(5, 5, 374, 164, 12);
        ctx.fill();
        ctx.strokeStyle = selected ? '#c2f878' : '#49646a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = selected ? '#c2f878' : '#b4c5c9';
        ctx.font = '500 23px Arial';
        ctx.fillText(`${zone.id} / ${zone.name}`, 23, 46, 310);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(350, 39, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eef4ef';
        ctx.font = '500 43px Arial';
        ctx.fillText(
          data.temperature === null
            ? 'No data'
            : live.current.metric === 'debt'
              ? `${Math.round(data.debt)} °C·min`
              : `${data.temperature.toFixed(1)} °C`,
          23,
          109,
        );
        ctx.font = '400 19px Arial';
        ctx.fillStyle = '#92aaa6';
        ctx.fillText(
          live.current.metric === 'debt'
            ? 'SHIFT EXPOSURE'
            : 'ZONE TEMPERATURE',
          23,
          145,
        );
        zone.texture.needsUpdate = true;
      }
      render();
    };
    update.current = () => {
      recolor();
      if (
        lastFocus !== live.current.focusedZone ||
        lastFocusRevision !== live.current.focusRevision
      ) {
        lastFocus = live.current.focusedZone;
        lastFocusRevision = live.current.focusRevision;
        aim(lastFocus);
      }
      wake();
    };
    restartProduction.current = () => {
      seconds = fixedTime ?? 0;
      previousActivity = seconds;
      previousFrame = 0;
      activity.update(seconds, 0);
      setMotion('on');
      render();
      wake();
    };
    let width = 0,
      height = 0;
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h || (w === width && h === height)) return;
      width = w;
      height = h;
      aspect = w / h;
      const { halfWidth, halfHeight } = facilityFrustum(aspect);
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      aim(live.current.focusedZone, true);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const controlsChange = () => {
      if (!applyingCamera) render();
    };
    const interruptCamera = () => {
      transition = null;
    };
    controls.addEventListener('change', controlsChange);
    controls.addEventListener('start', interruptCamera);
    cameraAction.current = (action) => {
      transition = null;
      if (action === 'reset') {
        lastFocus = null;
        live.current.onOverview();
        aim(null);
      } else {
        camera.zoom = THREE.MathUtils.clamp(
          camera.zoom * (action === 'in' ? 1.16 : 1 / 1.16),
          CAMERA.minZoom,
          CAMERA.maxZoom,
        );
        camera.updateProjectionMatrix();
      }
      render();
    };
    let clickStart: { pointerId: number; x: number; y: number } | null = null;
    const cancelClick = () => {
      clickStart = null;
    };
    const down = (e: PointerEvent) => {
      // Only a single, unmodified primary click can change the selected zone.
      // Right/middle drags and multi-touch gestures belong to OrbitControls.
      clickStart =
        e.isPrimary && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey
          ? { pointerId: e.pointerId, x: e.clientX, y: e.clientY }
          : null;
    };
    const move = (e: PointerEvent) => {
      if (
        clickStart?.pointerId === e.pointerId &&
        Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) > 5
      )
        cancelClick();
    };
    const up = (e: PointerEvent) => {
      const start = clickStart;
      cancelClick();
      if (
        !start ||
        start.pointerId !== e.pointerId ||
        e.button !== 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      // OrbitControls captures pointers; releasing outside the canvas is no pick.
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(
        picks.filter((object) => object.visible),
        false,
      )[0];
      if (hit) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.zone) object = object.parent;
        if (object?.userData.zone) {
          live.current.onSelect(object.userData.zone);
        }
      } else {
        live.current.onOverview();
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        e.isPrimary &&
        e.button === 0 &&
        live.current.focusedZone !== null &&
        e.target instanceof Node &&
        !container.closest('.map-panel')?.contains(e.target)
      )
        live.current.onOverview();
    };
    const lost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      setFailed(true);
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', cancelClick);
    renderer.domElement.addEventListener('lostpointercapture', cancelClick);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('blur', cancelClick);
    const suspend = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousFrame = 0;
      if (canAnimate()) {
        render();
        wake();
      }
    };
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      suspend();
    });
    visibility.observe(container);
    document.addEventListener('visibilitychange', suspend);
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        event.target instanceof Element &&
        event.target.closest('.map-panel')
      )
        cameraAction.current('reset');
    };
    document.addEventListener('keydown', escape);
    resize();
    recolor();
    wake();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', suspend);
      document.removeEventListener('keydown', escape);
      controls.removeEventListener('change', controlsChange);
      controls.removeEventListener('start', interruptCamera);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', cancelClick);
      renderer.domElement.removeEventListener(
        'lostpointercapture',
        cancelClick,
      );
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('blur', cancelClick);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      facility.dispose();
      activity.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      update.current = () => {};
      cameraAction.current = () => {};
    };
  }, []);
  return (
    <section className="warehouse-wrap" aria-label="Production floor controls">
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
            {props.focusedZone
              ? `${props.focusedZone} / ${ZONES.find((z) => z.id === props.focusedZone)?.name}`
              : 'NORI WORKS / PRODUCTION FLOOR'}
          </span>
          <div className="camera-buttons">
            <button
              onClick={() => restartProduction.current()}
              aria-label="Restart production sequence"
              title="Restart production sequence"
            >
              <ListRestart size={16} />
            </button>
            <button
              onClick={() => setMotion(activityRunning ? 'off' : 'on')}
              aria-pressed={activityRunning}
              aria-label={
                activityRunning
                  ? 'Pause factory activity'
                  : 'Play factory activity'
              }
              title={
                activityRunning
                  ? 'Pause factory activity'
                  : 'Play factory activity'
              }
            >
              {activityRunning ? <Pause size={14} /> : <Play size={14} />}
            </button>
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
              aria-label="Reset facility view"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="scene-footer">
            {props.focusedZone && (
              <button
                className="overview-button"
                onClick={() => cameraAction.current('reset')}
              >
                <ArrowLeft size={14} /> Whole factory
              </button>
            )}
            <span>
              {props.focusedZone
                ? 'Drag to orbit · Right-drag to pan · Click outside to deselect'
                : 'Drag to orbit · Right-drag to pan · Scroll to zoom'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
function BoxFallback() {
  return <span className="fallback-symbol">3D</span>;
}
