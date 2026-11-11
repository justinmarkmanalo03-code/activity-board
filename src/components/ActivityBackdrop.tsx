"use client";

import { useEffect, useRef } from "react";
import type * as TT from "three";

/**
 * Animated 3D background for the Activity Board.
 *
 * Drop-in replacement for the old <div className="bg-decor"> block:
 *   <ActivityBackdrop />                     full effect (dashboard, auth pages)
 *   <ActivityBackdrop intensity="calm" />    quieter version for dense pages (board)
 *
 * Theme: task cards drifting upward in lanes (a kanban board in motion),
 * activity "pings" when a card gets updated, an ECG heartbeat ribbon,
 * cute orbs whose eyes follow the cursor, and twinkling sparkles.
 *
 * three.js is loaded lazily so it never blocks first paint, and if WebGL is
 * unavailable the original CSS gradient blobs remain as the fallback.
 */

export type BackdropIntensity = "full" | "calm";

export function ActivityBackdrop({ intensity = "full" }: { intensity?: BackdropIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    import("three")
      .then((THREE) => {
        if (disposed) return;
        cleanup = mountScene(THREE, canvas, intensity);
      })
      .catch(() => {
        // three failed to load: CSS blobs stay visible as the fallback.
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [intensity]);

  return (
    <div className="bg-decor" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <canvas key={intensity} ref={canvasRef} className="bg-3d" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type ThreeModule = typeof import("three");

const PALETTE = [0x818cf8, 0xa78bfa, 0xe879f9, 0xf9a8d4, 0x7dd3fc, 0x5eead4, 0xfdba74, 0xfde68a];
const ORB_COLORS = [0xfda4af, 0x99f6e4, 0xfde68a, 0x93c5fd, 0xc4b5fd];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Fadeable {
  mat: TT.Material & { opacity: number };
  base: number;
}

function mountScene(THREE: ThreeModule, canvas: HTMLCanvasElement, intensity: BackdropIntensity): () => void {
  const calm = intensity === "calm";
  const small = window.innerWidth < 720;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const strength = calm ? 0.6 : 1;

  let renderer: TT.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return () => {};
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const CAM_Z = 18;
  camera.position.set(0, 0, CAM_Z);

  // Soft pastel lighting. Hemisphere + one key light keeps the look friendly.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8b4fe, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 9);
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);

  // Disposal bookkeeping.
  const geometries: TT.BufferGeometry[] = [];
  const materials: TT.Material[] = [];
  const textures: TT.Texture[] = [];
  const track = <G extends TT.BufferGeometry>(g: G): G => (geometries.push(g), g);
  const trackMat = <M extends TT.Material>(m: M): M => (materials.push(m), m);

  /** World-space half extents of the viewport at a given z. */
  const halfH = (z: number) => Math.tan((camera.fov * Math.PI) / 360) * (CAM_Z - z);
  let aspect = 1;
  const halfW = (z: number) => halfH(z) * aspect;

  /* ---------------- helpers ---------------- */

  function roundedRect(w: number, h: number, r: number): TT.Shape {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  const fadeables: Fadeable[] = [];

  // ---------------- task cards (kanban in motion) ----------------
  const CARD_W = 2.7;
  const CARD_H = 1.8;
  const cardBodyGeo = track(
    new THREE.ExtrudeGeometry(roundedRect(CARD_W, CARD_H, 0.28), {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 3,
      curveSegments: 8,
    })
  );
  cardBodyGeo.center();
  const barGeo = track(new THREE.ShapeGeometry(roundedRect(1.0, 0.17, 0.085)));
  const line1Geo = track(new THREE.ShapeGeometry(roundedRect(2.05, 0.13, 0.065)));
  const line2Geo = track(new THREE.ShapeGeometry(roundedRect(1.35, 0.13, 0.065)));
  const pillGeo = track(new THREE.ShapeGeometry(roundedRect(0.62, 0.2, 0.1)));
  const dotGeo = track(new THREE.CircleGeometry(0.15, 20));

  interface Card {
    group: TT.Group;
    body: TT.MeshStandardMaterial;
    lane: number;
    z: number;
    speed: number;
    offset: number;
    phase: number;
    scale: number;
    flash: number;
    accent: number;
  }

  const cards: Card[] = [];
  const laneCount = small ? 3 : 5;
  const cardCount = small ? 7 : calm ? 11 : 17;

  for (let i = 0; i < cardCount; i++) {
    const lane = i % laneCount;
    const accent = PALETTE[(i * 3 + 1) % PALETTE.length];
    const z = rand(-7, 1.5);

    const body = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.02,
        transparent: true,
        opacity: 0.78,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.12,
      })
    );
    fadeables.push({ mat: body, base: 0.78 * strength });

    const group = new THREE.Group();
    group.add(new THREE.Mesh(cardBodyGeo, body));

    const flat = (geo: TT.BufferGeometry, color: number, opacity: number, x: number, y: number) => {
      const m = trackMat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      fadeables.push({ mat: m, base: opacity * strength });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, 0.125);
      group.add(mesh);
    };
    flat(barGeo, accent, 0.95, -0.82, 0.6);
    flat(line1Geo, 0xc7c9f5, 0.9, 0, 0.22);
    flat(line2Geo, 0xdcd8f7, 0.9, -0.35, -0.08);
    flat(dotGeo, PALETTE[(i * 5 + 2) % PALETTE.length], 0.95, -0.95, -0.55);
    flat(pillGeo, PALETTE[(i * 2 + 4) % PALETTE.length], 0.8, 0.88, -0.55);

    root.add(group);
    cards.push({
      group,
      body,
      lane,
      z,
      speed: rand(0.012, 0.026),
      offset: Math.random(),
      phase: rand(0, Math.PI * 2),
      scale: rand(0.7, 1.15) * (z < -4 ? 1.1 : 1),
      flash: 0,
      accent,
    });
  }

  // ---------------- activity pings (expanding rings) ----------------
  const ringGeo = track(new THREE.RingGeometry(0.92, 1, 56));
  interface Ping {
    mesh: TT.Mesh;
    mat: TT.MeshBasicMaterial;
    age: number;
    life: number;
    active: boolean;
    maxScale: number;
  }
  const pings: Ping[] = [];
  const PING_POOL = small ? 4 : 8;
  for (let i = 0; i < PING_POOL; i++) {
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE[i % PALETTE.length],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.visible = false;
    root.add(mesh);
    pings.push({ mesh, mat, age: 0, life: 3, active: false, maxScale: 2.6, });
  }

  function spawnPing(x: number, y: number, z: number, color: number, maxScale = 2.6) {
    const p = pings.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.age = 0;
    p.life = rand(2.6, 3.6);
    p.maxScale = maxScale;
    p.mat.color.setHex(color);
    p.mesh.position.set(x, y, z - 0.2);
    p.mesh.visible = true;
  }

  // ---------------- heartbeat / ECG ribbon ----------------
  const SEG = 150;
  const ribbonPos = new Float32Array((SEG + 1) * 2 * 3);
  const ribbonCol = new Float32Array((SEG + 1) * 2 * 3);
  const ribbonIdx: number[] = [];
  const cA = new THREE.Color(0x6366f1);
  const cB = new THREE.Color(0xe879f9);
  const tmpC = new THREE.Color();
  for (let i = 0; i <= SEG; i++) {
    tmpC.copy(cA).lerp(cB, i / SEG);
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3;
      ribbonCol[o] = tmpC.r;
      ribbonCol[o + 1] = tmpC.g;
      ribbonCol[o + 2] = tmpC.b;
    }
    if (i < SEG) {
      const a = i * 2;
      ribbonIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const ribbonGeo = track(new THREE.BufferGeometry());
  ribbonGeo.setAttribute("position", new THREE.BufferAttribute(ribbonPos, 3).setUsage(THREE.DynamicDrawUsage));
  ribbonGeo.setAttribute("color", new THREE.BufferAttribute(ribbonCol, 3));
  ribbonGeo.setIndex(ribbonIdx);
  const ribbonMat = trackMat(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55 * strength,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.frustumCulled = false;
  root.add(ribbon);

  const beatGeo = track(new THREE.SphereGeometry(0.13, 16, 16));
  const beatMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 * strength }));
  const beat = new THREE.Mesh(beatGeo, beatMat);
  root.add(beat);
  const RIBBON_Z = -3;

  function ribbonY(u: number, t: number, hh: number, cursor: number) {
    const base = -hh * 0.74;
    const wave = Math.sin(u * 5 + t * 0.9) * 0.18 + Math.sin(u * 11 - t * 0.6) * 0.07;
    const d = u - cursor;
    // ECG-like blip: small dip, tall spike, small recoil.
    const spike = Math.exp(-(d * d) / 0.00018) * 1.5 - Math.exp(-((d - 0.012) * (d - 0.012)) / 0.00012) * 0.5;
    return base + wave + spike;
  }

  // ---------------- cute orbs ----------------
  interface Orb {
    group: TT.Group;
    face: TT.Group;
    eyes: TT.Mesh[];
    nx: number;
    ny: number;
    z: number;
    phase: number;
    nextBlink: number;
    blink: number;
    r: number;
  }
  const orbs: Orb[] = [];
  const orbSpots: [number, number, number][] = [
    [-0.78, 0.5, 0.5],
    [0.82, -0.18, 1.2],
    [-0.5, -0.5, -1],
    [0.52, 0.62, -2.5],
    [0.05, -0.08, -6],
  ];
  const orbCount = small ? 2 : calm ? 3 : 5;
  const eyeGeo = track(new THREE.SphereGeometry(1, 14, 14));
  const cheekGeo = track(new THREE.CircleGeometry(1, 20));
  const mouthGeoCache = new Map<number, TT.TorusGeometry>();
  const eyeMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x2b2358 }));
  const cheekMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.45 }));
  const mouthMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x2b2358 }));

  for (let i = 0; i < orbCount; i++) {
    const [nx, ny, z] = orbSpots[i];
    const r = rand(0.55, 0.8) * (z < -4 ? 1.5 : 1);
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        color: ORB_COLORS[i % ORB_COLORS.length],
        roughness: 0.28,
        metalness: 0,
        transparent: true,
        opacity: 0.92,
        emissive: new THREE.Color(ORB_COLORS[i % ORB_COLORS.length]),
        emissiveIntensity: 0.22,
      })
    );
    fadeables.push({ mat, base: 0.92 * strength });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(track(new THREE.SphereGeometry(r, 32, 24)), mat));

    const face = new THREE.Group();
    const surfaceZ = (x: number, y: number) => Math.sqrt(Math.max(r * r - x * x - y * y, 0.0001));
    const eyes: TT.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const ex = sx * r * 0.3;
      const ey = r * 0.12;
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(r * 0.075, r * 0.1, r * 0.05);
      eye.position.set(ex, ey, surfaceZ(ex, ey));
      face.add(eye);
      eyes.push(eye);

      const cx = sx * r * 0.52;
      const cy = -r * 0.1;
      const cheek = new THREE.Mesh(cheekGeo, cheekMat);
      cheek.scale.set(r * 0.12, r * 0.08, 1);
      cheek.position.set(cx, cy, surfaceZ(cx, cy) + 0.01);
      cheek.rotation.y = sx * 0.55;
      face.add(cheek);
    }
    const mouthKey = Math.round(r * 100);
    let mouthGeo = mouthGeoCache.get(mouthKey);
    if (!mouthGeo) {
      mouthGeo = track(new THREE.TorusGeometry(r * 0.09, r * 0.018, 8, 18, Math.PI));
      mouthGeoCache.set(mouthKey, mouthGeo);
    }
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.rotation.z = Math.PI; // flip the arc so it smiles
    mouth.position.set(0, -r * 0.02, surfaceZ(0, -r * 0.02) + 0.005);
    face.add(mouth);

    group.add(face);
    root.add(group);
    orbs.push({ group, face, eyes, nx, ny, z, phase: rand(0, 6), nextBlink: rand(1, 4), blink: 0, r });
  }

  // ---------------- check-mark badges (done!) ----------------
  interface Badge {
    group: TT.Group;
    nx: number;
    ny: number;
    z: number;
    phase: number;
  }
  const badges: Badge[] = [];
  const badgeSpots: [number, number, number][] = [
    [-0.35, 0.72, -1.5],
    [0.28, -0.62, 0],
    [0.9, 0.3, -3],
  ];
  const badgeDiscGeo = track(new THREE.CylinderGeometry(0.48, 0.48, 0.14, 32));
  const checkMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const armA = track(new THREE.BoxGeometry(0.3, 0.1, 0.06));
  const armB = track(new THREE.BoxGeometry(0.55, 0.1, 0.06));
  const badgeCount = small ? 1 : calm ? 2 : 3;
  for (let i = 0; i < badgeCount; i++) {
    const [nx, ny, z] = badgeSpots[i];
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5eead4,
        roughness: 0.3,
        transparent: true,
        opacity: 0.9,
        emissive: new THREE.Color(0x5eead4),
        emissiveIntensity: 0.25,
      })
    );
    fadeables.push({ mat, base: 0.9 * strength });
    const group = new THREE.Group();
    const disc = new THREE.Mesh(badgeDiscGeo, mat);
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
    const a = new THREE.Mesh(armA, checkMat);
    a.position.set(-0.13, -0.07, 0.1);
    a.rotation.z = -Math.PI / 4;
    const b = new THREE.Mesh(armB, checkMat);
    b.position.set(0.07, 0.03, 0.1);
    b.rotation.z = Math.PI / 4;
    group.add(a, b);
    group.scale.setScalar(rand(0.7, 1));
    root.add(group);
    badges.push({ group, nx, ny, z, phase: rand(0, 6) });
  }

  // ---------------- sparkles ----------------
  function makeSprite(draw: (ctx: CanvasRenderingContext2D) => void): TT.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    const tex = new THREE.CanvasTexture(c);
    textures.push(tex);
    return tex;
  }
  const starTex = makeSprite((ctx) => {
    ctx.translate(32, 32);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 - Math.PI / 2;
      const rad = i % 2 === 0 ? 30 : 6;
      ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.fill();
  });
  const dotTex = makeSprite((ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

  function makePoints(count: number, tex: TT.Texture, size: number, color: number): TT.Points {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = rand(-24, 24);
      arr[i * 3 + 1] = rand(-14, 14);
      arr[i * 3 + 2] = rand(-10, 4);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = trackMat(
      new THREE.PointsMaterial({
        map: tex,
        size,
        color,
        transparent: true,
        opacity: 0.8 * strength,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    root.add(p);
    return p;
  }
  const sparkleN = small ? 26 : calm ? 40 : 70;
  const stars = makePoints(sparkleN, starTex, 0.42, 0xffffff);
  const dust = makePoints(sparkleN, dotTex, 0.55, 0xf5d0fe);

  /* ---------------- sizing + input ---------------- */

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    aspect = w / Math.max(h, 1);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (reduced) draw(8);
  }

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  function onPointerMove(e: PointerEvent) {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }

  /* ---------------- frame ---------------- */

  const wp = new THREE.Vector3();
  let lastT = 0;
  let nextPulse = 1.2;

  function draw(t: number) {
    const dt = Math.min(Math.max(t - lastT, 0), 0.1);
    lastT = t;

    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;

    camera.position.x = mouse.x * 1.3;
    camera.position.y = -mouse.y * 0.8;
    camera.lookAt(0, 0, 0);

    // cards
    const laneSpan = 1.7 / (laneCount - 1 || 1);
    for (const c of cards) {
      const p = (c.offset + t * c.speed) % 1;
      const hh = halfH(c.z);
      const hw = halfW(c.z);
      const nx = -0.85 + c.lane * laneSpan;
      const x = nx * hw + Math.sin(t * 0.4 + c.phase) * 0.25;
      const y = (p * 2.7 - 1.35) * hh;
      c.group.position.set(x, y, c.z);
      c.group.rotation.set(
        Math.cos(t * 0.25 + c.phase) * 0.12 - mouse.y * 0.1,
        Math.sin(t * 0.3 + c.phase) * 0.35 + mouse.x * 0.15,
        Math.sin(t * 0.2 + c.phase) * 0.06
      );
      c.flash = Math.max(0, c.flash - dt * 0.9);
      c.group.scale.setScalar(c.scale * (1 + c.flash * 0.06));
      c.body.emissiveIntensity = 0.12 + c.flash * 0.75;
      c.group.userData.fade = Math.min(1, p / 0.14, (1 - p) / 0.14);
    }

    // Apply each card's fade to its materials. Cards register their materials first,
    // in order: body + 5 detail meshes = 6 entries per card (see the card loop above).
    let fi = 0;
    for (const c of cards) {
      const fade = clamp01(c.group.userData.fade as number);
      for (let k = 0; k < 6; k++) {
        const f = fadeables[fi++];
        f.mat.opacity = f.base * fade;
      }
    }

    // activity pings: a random card "gets updated"
    if (!reduced && t > nextPulse) {
      nextPulse = t + rand(1.4, 3.0);
      const c = cards[Math.floor(Math.random() * cards.length)];
      if (c && (c.group.userData.fade as number) > 0.6) {
        c.flash = 1;
        c.group.getWorldPosition(wp);
        spawnPing(wp.x, wp.y, wp.z, c.accent, 2.2);
      }
    }
    for (const p of pings) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.scale.setScalar(0.25 + k * p.maxScale);
      p.mat.opacity = (1 - k) * (1 - k) * 0.55 * strength;
    }

    // heartbeat ribbon
    const hhR = halfH(RIBBON_Z);
    const hwR = halfW(RIBBON_Z);
    const thick = 0.07;
    const cursor = ((t * 0.09) % 1.4) - 0.2;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const x = (u * 2 - 1) * hwR * 1.05;
      const y = ribbonY(u, t, hhR, cursor);
      const o = i * 2 * 3;
      ribbonPos[o] = x;
      ribbonPos[o + 1] = y + thick;
      ribbonPos[o + 2] = RIBBON_Z;
      ribbonPos[o + 3] = x;
      ribbonPos[o + 4] = y - thick;
      ribbonPos[o + 5] = RIBBON_Z;
    }
    (ribbonGeo.getAttribute("position") as TT.BufferAttribute).needsUpdate = true;
    const bu = clamp01(cursor);
    beat.position.set((bu * 2 - 1) * hwR * 1.05, ribbonY(bu, t, hhR, cursor), RIBBON_Z + 0.05);
    beat.scale.setScalar(1 + Math.sin(t * 8) * 0.12);

    // orbs (eyes follow the cursor)
    for (const o of orbs) {
      const hh = halfH(o.z);
      const hw = halfW(o.z);
      o.group.position.set(
        o.nx * hw * 0.9 + Math.sin(t * 0.35 + o.phase) * 0.4,
        o.ny * hh * 0.9 + Math.sin(t * 0.8 + o.phase) * 0.28,
        o.z
      );
      o.group.rotation.y += (mouse.x * 0.55 - o.group.rotation.y) * 0.05;
      o.group.rotation.x += (mouse.y * 0.35 - o.group.rotation.x) * 0.05;
      o.group.rotation.z = Math.sin(t * 0.5 + o.phase) * 0.08;

      if (!reduced && t > o.nextBlink) {
        o.blink = 0.14;
        o.nextBlink = t + rand(2.5, 6);
      }
      if (o.blink > 0) o.blink -= dt;
      const open = o.blink > 0 ? 0.12 : 1;
      for (const e of o.eyes) e.scale.y = o.r * 0.1 * open;
    }

    // check badges
    for (const b of badges) {
      const hh = halfH(b.z);
      const hw = halfW(b.z);
      b.group.position.set(b.nx * hw * 0.9, b.ny * hh * 0.9 + Math.sin(t * 0.7 + b.phase) * 0.3, b.z);
      b.group.rotation.set(Math.sin(t * 0.4 + b.phase) * 0.25, Math.cos(t * 0.35 + b.phase) * 0.4, Math.sin(t * 0.3 + b.phase) * 0.1);
    }

    // sparkles
    stars.rotation.z = t * 0.012;
    dust.rotation.z = -t * 0.008;
    (stars.material as TT.PointsMaterial).opacity = (0.55 + Math.sin(t * 1.6) * 0.3) * strength;
    (dust.material as TT.PointsMaterial).opacity = (0.55 + Math.cos(t * 1.1) * 0.3) * strength;

    renderer.render(scene, camera);
  }

  /* ---------------- start ---------------- */

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  let raf = 0;
  let alive = true;
  const startedAt = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    draw((performance.now() - startedAt) / 1000);
  };

  if (reduced) {
    draw(8); // single still frame
  } else {
    loop();
  }
  // Fade the canvas in once the first frame is on screen.
  requestAnimationFrame(() => {
    if (alive) canvas.classList.add("is-ready");
  });

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointerMove);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.classList.remove("is-ready");
  };
}
