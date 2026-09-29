// Builds a 3D wheel from a wheel definition (src/data/wheels/*.json): nothing here is specific to one wheel.
// Materials are procedural (carbon twill, alcantara, knurled aluminium), so there are no texture files to license.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Wheel } from "../../data/wheels/index";
import type { Led } from "./lights";

export interface WheelModel {
  group: THREE.Group;
  /** Rotates / tilts as a whole (the stage moves this). */
  pivot: THREE.Group;
  screenCanvas: HTMLCanvasElement;
  screenTexture: THREE.CanvasTexture;
  ledMeshes: THREE.Mesh[];
  /** 0..1: the build-in (body extrudes, parts appear). */
  setBuild(t: number): void;
  setLeds(frame: Led[]): void;
  /** Wheel coordinates (definition units) -> local 3D point on the front face. */
  toLocal(x: number, y: number, z?: number): THREE.Vector3;
  dispose(): void;
}

// ---------- procedural textures ----------
function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

function carbonTextures() {
  const n = 512, cell = 32;
  const col = canvas(n, n), nor = canvas(n, n), rough = canvas(n, n);
  const c = col.getContext("2d")!, m = nor.getContext("2d")!, r = rough.getContext("2d")!;
  for (let y = 0; y < n / cell * 2; y++) for (let x = 0; x < n / cell * 2; x++) {
    // 2x2 twill: tows alternate direction, shifted each row
    const horiz = ((x + y) >> 1) % 2 === 0;
    const px = x * cell / 2, py = y * cell / 2, s = cell / 2;
    const g = c.createLinearGradient(px, py, horiz ? px : px + s, horiz ? py + s : py);
    g.addColorStop(0, "#0b0c0e"); g.addColorStop(0.5, horiz ? "#2a2d33" : "#1a1c20"); g.addColorStop(1, "#0b0c0e");
    c.fillStyle = g; c.fillRect(px, py, s, s);
    // normal map: tows bulge across their width
    const gn = m.createLinearGradient(px, py, horiz ? px : px + s, horiz ? py + s : py);
    gn.addColorStop(0, horiz ? "rgb(128,60,255)" : "rgb(60,128,255)");
    gn.addColorStop(0.5, "rgb(128,128,255)");
    gn.addColorStop(1, horiz ? "rgb(128,196,255)" : "rgb(196,128,255)");
    m.fillStyle = gn; m.fillRect(px, py, s, s);
    r.fillStyle = horiz ? "#707070" : "#909090"; r.fillRect(px, py, s, s);
  }
  const make = (cv: HTMLCanvasElement, srgb = false) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(col, true), normalMap: make(nor), roughnessMap: make(rough) };
}

function noiseTexture(base: number, spread: number, size = 256) {
  const cv = canvas(size, size), c = cv.getContext("2d")!, img = c.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = base + (Math.random() - 0.5) * spread;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function knurlNormal() {
  const cv = canvas(256, 32), c = cv.getContext("2d")!;
  for (let x = 0; x < 256; x += 4) {
    const g = c.createLinearGradient(x, 0, x + 4, 0);
    g.addColorStop(0, "rgb(40,128,255)"); g.addColorStop(0.5, "rgb(128,128,255)"); g.addColorStop(1, "rgb(216,128,255)");
    c.fillStyle = g; c.fillRect(x, 0, 4, 32);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- geometry helpers ----------
/** Keeps the part of a polygon with x < limit (or > limit when `right`). Sutherland-Hodgman against one edge. */
function clipX(poly: [number, number][], limit: number, right: boolean) {
  const inside = (p: [number, number]) => (right ? p[0] >= limit : p[0] <= limit);
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (limit - a[0]) / (b[0] - a[0]); out.push([limit, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export function buildWheel(w: Wheel, opts: { quality?: "high" | "low" } = {}): WheelModel {
  const k = w.widthMm / 100 / w.size[0];              // definition units -> world (1 = 10 cm)
  const BEVEL = 0.045;                                   // rounded edge, small enough to keep the traced notches
  const depth = Math.max(0.05, w.depthMm / 100 - BEVEL * 2); // the flat core between the two bevels
  const front = depth / 2 + BEVEL;                       // the face, bevel included: parts sit on it
  const cx = w.size[0] / 2, cy = w.size[1] / 2;
  const P = (x: number, y: number) => new THREE.Vector2((x - cx) * k, -(y - cy) * k);
  const toLocal = (x: number, y: number, z = front) => new THREE.Vector3((x - cx) * k, -(y - cy) * k, z);
  const seg = opts.quality === "low" ? 6 : 14;

  const pivot = new THREE.Group();
  const group = new THREE.Group();
  pivot.add(group);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ----- body: the outline, smoothed, extruded, carbon -----
  const shape = new THREE.Shape();
  const pts = w.outline.map(([x, y]) => P(x, y));
  shape.moveTo(pts[0].x, pts[0].y);
  shape.splineThru([...pts.slice(1), pts[0]]);
  const bodyGeo = keep(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: 0.022, bevelSegments: seg, curveSegments: 48, steps: 1,
  }));
  bodyGeo.translate(0, 0, -depth / 2);
  const carbon = carbonTextures();
  for (const t of Object.values(carbon)) { t.repeat.set(1.3, 1.3); keep(t); }
  const bodyMat = keep(new THREE.MeshPhysicalMaterial({
    ...carbon, color: 0xffffff, metalness: 0.25, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.16,
    normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1,
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // ----- neon rim: a thin red glowing line just inside the front edge -----
  // inset along each point's normal (the traced outline has concave parts, so not towards the centre)
  const ol = w.outline, n = ol.length;
  const area = ol.reduce((s, [x, y], i) => { const [x2, y2] = ol[(i + 1) % n]; return s + x * y2 - x2 * y; }, 0);
  const inward = area > 0 ? 1 : -1; // y points down: positive area = clockwise on screen
  const rimCurve = new THREE.CatmullRomCurve3(ol.map(([x, y], i) => {
    const [ax, ay] = ol[(i - 2 + n) % n], [bx, by] = ol[(i + 2) % n];
    const tx = bx - ax, ty = by - ay, l = Math.hypot(tx, ty) || 1;
    return toLocal(x - inward * (ty / l) * 4, y + inward * (tx / l) * 4, front + 0.004);
  }), true, "centripetal");
  const rimMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.12, 0.18), toneMapped: false }));
  const rim = new THREE.Mesh(keep(new THREE.TubeGeometry(rimCurve, 400, 0.006, 8, true)), rimMat);
  group.add(rim);

  // ----- bezel and screen -----
  const b = w.bezel, s = w.screen;
  const bezelMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }));
  const bezel = new THREE.Mesh(keep(new RoundedBoxGeometry(b.w * k, b.h * k, 0.07, 6, b.r * k)), bezelMat);
  bezel.position.copy(toLocal(b.x + b.w / 2, b.y + b.h / 2, front + 0.035));
  group.add(bezel);
  const screenCanvas = canvas(s.px[0], s.px[1]);
  const screenTexture = keep(new THREE.CanvasTexture(screenCanvas));
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  const screenMat = keep(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: new THREE.Color(1.12, 1.12, 1.12) })); // a touch over 1: bright text glows a little
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(s.w * k, s.h * k)), screenMat);
  screen.position.copy(toLocal(s.x + s.w / 2, s.y + s.h / 2, front + 0.0712));
  group.add(screen);
  // glass over the screen: catches reflections
  const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.18, envMapIntensity: 2.4 }));
  const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(b.w * k * 0.97, b.h * k * 0.95)), glassMat);
  glass.position.copy(toLocal(b.x + b.w / 2, b.y + b.h / 2, front + 0.0725));
  group.add(glass);

  // ----- LEDs -----
  const ledMeshes: THREE.Mesh[] = [];
  const ledMats: THREE.MeshBasicMaterial[] = [];
  const smoked = keep(new THREE.MeshPhysicalMaterial({ color: 0x120405, roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 }));
  const revLeds = w.groups.rev?.leds ?? [];
  if (revLeds.length) {
    const xs = revLeds.map(i => w.leds[i].x), y = w.leds[revLeds[0]].y;
    const x0 = Math.min(...xs) - 9, x1 = Math.max(...xs) + 9;
    const strip = new THREE.Mesh(keep(new RoundedBoxGeometry((x1 - x0) * k, 16 * k, 0.012, 3, 6 * k)), smoked);
    strip.position.copy(toLocal((x0 + x1) / 2, y, front + 0.078));
    group.add(strip);
  }
  for (const led of w.leds) {
    const mat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    // every LED is a light on the face: button and encoder LEDs too (no caps or knobs drawn)
    const big = led.group === "buttons" || led.group === "encoders";
    const mesh = new THREE.Mesh(keep(new THREE.SphereGeometry((big ? 11 : led.r * 1.05) * k, 24, 12)), mat);
    mesh.scale.z = 0.45;
    mesh.position.copy(toLocal(led.x, led.y, front + (big ? 0.004 : 0.072)));
    mesh.userData.index = led.i;
    ledMeshes[led.i] = mesh;
    ledMats[led.i] = mat;
    group.add(mesh);
  }

  // ----- paddles and quick release, behind -----
  const alu = keep(new THREE.MeshStandardMaterial({ color: 0x6f757e, metalness: 1, roughness: 0.5, envMapIntensity: 0.55 }));
  // paddles left out: no measured shape for them yet (the quick release sits behind the body, out of sight from the front)
  const qr = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.34, 0.38, 0.35, 64)), alu);
  qr.rotation.x = Math.PI / 2; qr.position.set(0, 0.05, -front - 0.18);
  group.add(qr);
  const qrRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.36, 0.02, 12, 64)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.08, 0.12), toneMapped: false })));
  qrRing.position.set(0, 0.05, -front - 0.355);
  group.add(qrRing);

  // ----- build-in and LEDs -----
  const parts = group.children.filter(c => c !== body);
  function setBuild(t: number) {
    const e = 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    body.scale.z = Math.max(0.001, e);
    rimMat.color.setRGB(2.2 * e, 0.12 * e, 0.18 * e);
    for (const [i, p] of parts.entries()) {
      const at = Math.max(0, Math.min(1, (t - 0.35 - (i / parts.length) * 0.4) / 0.25));
      p.visible = at > 0;
      p.scale.setScalar(p === rim ? 1 : 0.6 + 0.4 * at);
    }
  }
  function setLeds(frame: Led[]) {
    for (const led of w.leds) {
      const f = frame[led.i], m = ledMats[led.i];
      if (!f || !m) continue;
      const boost = led.group === "buttons" || led.group === "encoders" ? 1.3 : 2.5;
      const a = f.a;
      // a dim smoky lens when off, HDR colour when lit (the bloom pass makes the glow)
      m.color.setRGB(0.012 + f.c[0] * a * boost, 0.01 + f.c[1] * a * boost, 0.012 + f.c[2] * a * boost);
    }
  }

  return {
    group, pivot, screenCanvas, screenTexture, ledMeshes, setBuild, setLeds, toLocal,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
