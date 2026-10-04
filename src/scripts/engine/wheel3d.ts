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

/** The lights are drawn 30% brighter than their data value (the core stops at full colour, the glow takes all of it). */
const LED_GAIN = 1.3;

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
    g.addColorStop(0, "#0c0d0f"); g.addColorStop(0.5, horiz ? "#1f2126" : "#16181b"); g.addColorStop(1, "#0c0d0f");
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
type Pt = [number, number];

function pointInPoly([x, y]: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A polygon moved `d` units inwards along each point's normal (works for the traced, partly concave shapes). */
function inset(poly: Pt[], d: number): Pt[] {
  const n = poly.length;
  const area = poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % n]; return s + x * y2 - x2 * y; }, 0);
  const sign = area > 0 ? 1 : -1;
  return poly.map(([x, y], i) => {
    const [ax, ay] = poly[(i - 1 + n) % n], [bx, by] = poly[(i + 1) % n];
    const tx = bx - ax, ty = by - ay, l = Math.hypot(tx, ty) || 1;
    return [x - sign * (ty / l) * d, y + sign * (tx / l) * d];
  });
}

/**
 * Builds the wheel from its definition, the way the real one is put together (front to back): rubber grips; aluminium
 * button pods on a thin carbon faceplate, with see-through windows round the knobs and the thumb openings; the screen
 * in its frame; the knobs coming up through their windows from the electronics housing behind, their lights shining
 * round the window edges; carbon paddles behind the plate; the quick release half on the back of the housing.
 */
export function buildWheel(w: Wheel, opts: { quality?: "high" | "low" } = {}): WheelModel {
  const k = w.widthMm / 100 / w.size[0];               // definition units -> world (1 = 10 cm)
  const mm = 0.01;                                       // millimetres -> world
  const PLATE = (w.plateMm ?? 5) * mm, BEVEL = 0.006;
  const front = PLATE / 2;                               // the carbon face: the plate is centred on z = 0
  const back = -PLATE / 2;
  const POD = (w.podMm ?? 6) * mm;
  const podTop = front + POD;
  const cx = w.size[0] / 2, cy = w.size[1] / 2;
  const P = (x: number, y: number) => new THREE.Vector2((x - cx) * k, -(y - cy) * k);
  const toLocal = (x: number, y: number, z = front) => new THREE.Vector3((x - cx) * k, -(y - cy) * k, z);
  const mirror = (pts: Pt[], right: boolean): Pt[] => right ? pts.map(([x, y]) => [w.size[0] - x, y] as Pt) : pts;
  const seg = opts.quality === "low" ? 6 : 14;

  const pivot = new THREE.Group();
  const group = new THREE.Group();
  pivot.add(group);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const add = (m: THREE.Mesh, shadows = true) => { m.castShadow = m.receiveShadow = shadows; group.add(m); return m; };

  const pathOf = (pts: Pt[], into: THREE.Path = new THREE.Path()) => {
    pts.forEach(([x, y], i) => { const v = P(x, y); if (i === 0) into.moveTo(v.x, v.y); else into.lineTo(v.x, v.y); });
    into.closePath();
    return into;
  };
  const shapeOf = (pts: Pt[], holes: Pt[][] = []) => {
    const s = pathOf(pts, new THREE.Shape()) as THREE.Shape;
    for (const h of holes) s.holes.push(pathOf(h));
    return s;
  };
  const roundedRect = (x: number, y: number, bw: number, bh: number, r: number): Pt[] => {
    const c: Pt[] = [], n = 8;
    const corner = (ox: number, oy: number, a0: number) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; c.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]); } };
    corner(x + bw - r, y + r, -Math.PI / 2); corner(x + bw - r, y + bh - r, 0); corner(x + r, y + bh - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
    return c;
  };
  /** A flat part: `shape` extruded `t` thick with rounded edges, its front face at `z`. */
  const slab = (shape: THREE.Shape, t: number, z: number, bevel: number, mat: THREE.Material, curve = 32) => {
    const core = Math.max(0.002, t - bevel * 2);
    const g = keep(new THREE.ExtrudeGeometry(shape, { depth: core, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: Math.max(2, seg >> 2), curveSegments: curve, steps: 1 }));
    g.translate(0, 0, z - bevel - core);
    return add(new THREE.Mesh(g, mat));
  };

  // ----- materials (procedural: no texture files) -----
  const carbon = carbonTextures();
  for (const t of Object.values(carbon)) { t.repeat.set(4, 4); t.anisotropy = 16; keep(t); }
  const carbonMat = keep(new THREE.MeshPhysicalMaterial({
    ...carbon, color: 0xffffff, metalness: 0.05, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.45,
    normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.35, // matte-ish: no sheet of reflected light across the face as it turns
  }));
  const anodised = keep(new THREE.MeshStandardMaterial({ color: 0x2b2d32, metalness: 0.75, roughness: 0.42, envMapIntensity: 0.6 })); // the pods and the screen frame
  const housingMat = keep(new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: 0.1, roughness: 0.78 }));
  const gripMat = keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.92, metalness: 0, bumpMap: keep(noiseTexture(128, 60)), bumpScale: 0.35 }));
  const redAlu = keep(new THREE.MeshStandardMaterial({ color: 0xa3151f, metalness: 0.7, roughness: 0.34, envMapIntensity: 0.8 }));
  const blackAlu = keep(new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.6, roughness: 0.38 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 1, roughness: 0.22 }));
  const gold = keep(new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }));
  const btnBezel = keep(new THREE.MeshStandardMaterial({ color: 0x121317, metalness: 0.5, roughness: 0.45 }));
  const capGlass = keep(new THREE.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  const knurlMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3d43, metalness: 0.85, roughness: 0.4 }));
  const knobTop = keep(new THREE.MeshPhysicalMaterial({ color: 0x0a0b0d, metalness: 0.2, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }));

  const upright = <T extends THREE.BufferGeometry>(g: T) => { g.rotateX(Math.PI / 2); return g; }; // axis Y -> out of the face
  /** Lathe profile [radius, height] in world units (listed from the top down), stood up on the face. */
  const lathe = (pts: [number, number][], n = 64) =>
    keep(upright(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)).reverse(), n)));
  /** A cylinder along Y with rounded flutes round its side (knurling). */
  const flutedY = (r: number, h: number, flutes: number, depth: number) => {
    const g = new THREE.CylinderGeometry(r, r, h, flutes * 8, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
      if (rr < r * 0.5) continue;
      const f = 1 - depth * Math.pow(Math.max(0, Math.cos(Math.atan2(z, x) * flutes)), 2);
      pos.setX(i, x * f); pos.setZ(i, z * f);
    }
    g.computeVertexNormals();
    return keep(g);
  };
  const fluted = (r: number, h: number, flutes: number, depth: number) => upright(flutedY(r, h, flutes, depth));

  // ----- faceplate: the outline, smoothed, with the windows cut through, carbon -----
  const windows = (w.windows ?? []) as Pt[][];
  const plateShape = new THREE.Shape();
  const pts = w.outline.map(([x, y]) => P(x, y));
  plateShape.moveTo(pts[0].x, pts[0].y);
  plateShape.splineThru([...pts.slice(1), pts[0]]);
  for (const win of windows) plateShape.holes.push(pathOf(win));
  // 6 steps per spline segment: the traced points are ~3 mm apart, so 6 keeps the edge within 0.015 mm of the 48-step
  // curve (far below a pixel) with 2.4k contour points instead of 19k: 306k triangles for the plate became ~40k
  slab(plateShape, PLATE, front, BEVEL, carbonMat, 6);

  // ----- button pods: anodised aluminium on the faceplate -----
  const pods: Pt[][] = [];
  for (const pod of w.pods ?? [])
    for (const right of [false, true]) {
      const outer = mirror(pod.outer as Pt[], right);
      pods.push(outer);
      slab(shapeOf(outer, pod.holes.map(h => mirror(h as Pt[], right))), POD + 0.5 * mm, podTop, 0.008, anodised); // sunk 0.5 mm into the plate: no edge lying exactly on its face
    }
  const onPod = (x: number, y: number) => pods.some(p => pointInPoly([x, y], p));

  // ----- grips: thick, well rounded, soft rubber; their front stands proud of the pods -----
  for (const gdef of w.grips ?? [])
    for (const right of [false, true]) {
      const poly = mirror(gdef.points as Pt[], right);
      if (poly.length < 3) continue;
      const gd = 0.16, round = 0.12; // 40 mm in all
      const gg = keep(new THREE.ExtrudeGeometry(shapeOf(poly), { depth: gd, bevelEnabled: true, bevelThickness: round, bevelSize: round, bevelOffset: -round, bevelSegments: Math.max(8, seg), curveSegments: 24 }));
      gg.translate(0, 0, front + 0.11 - round - gd); // front face 11 mm proud of the carbon, the rest behind
      add(new THREE.Mesh(gg, gripMat));
    }

  // ----- electronics housing behind the centre (seen through the knob windows) -----
  const hs = w.housing;
  const housingBack = hs ? back - hs.depthMm * mm : back;
  // its face sits 4 mm behind the plate: the knob windows' lights and labels lie in that gap, a millimetre apart
  // (thinner gaps flickered on phones, whose depth buffers can't tell them apart)
  if (hs) slab(shapeOf(roundedRect(hs.x, hs.y, hs.w, hs.h, hs.r)), hs.depthMm * mm, back - 4 * mm, 0.04, housingMat);

  // ----- paddles behind the plate: carbon -----
  for (const pd of w.paddles ?? [])
    for (const right of [false, true]) {
      const x = right ? w.size[0] - pd.x - pd.w : pd.x;
      slab(shapeOf(roundedRect(x, pd.y, pd.w, pd.h, pd.r)), 0.04, back - pd.back * mm, 0.006, carbonMat);
    }

  // ----- neon rim: a thin red glowing line just inside the front edge -----
  const ol = w.outline as Pt[];
  const rimCurve = new THREE.CatmullRomCurve3(inset(ol, 4).map(([x, y]) => toLocal(x, y, front + 0.004)), true, "centripetal");
  const rimMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.035, 0.05), toneMapped: false }));
  group.add(new THREE.Mesh(keep(new THREE.TubeGeometry(rimCurve, 600, 0.008, 8, true)), rimMat));

  // ----- screen frame (anodised, like the pods) and screen -----
  const b = w.bezel, s = w.screen;
  const bezel = add(new THREE.Mesh(keep(new RoundedBoxGeometry(b.w * k, b.h * k, 0.07, 6, b.r * k)), anodised));
  bezel.position.copy(toLocal(b.x + b.w / 2, b.y + b.h / 2, front + 0.035));
  const screenCanvas = canvas(s.px[0], s.px[1]);
  const screenTexture = keep(new THREE.CanvasTexture(screenCanvas));
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  const screenMat = keep(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95) })); // just under full white: text stays crisp
  const screenFace = new THREE.Mesh(keep(new THREE.PlaneGeometry(s.w * k, s.h * k)), screenMat);
  screenFace.position.copy(toLocal(s.x + s.w / 2, s.y + s.h / 2, front + 0.0712));
  group.add(screenFace);
  // (no reflective glass layer over the screen: it put a moving band of light across the dash)

  // ----- LEDs -----
  const ledMats: THREE.MeshBasicMaterial[] = [];
  const labelMats: THREE.MeshBasicMaterial[] = []; // encoder labels, lit by their LED
  const ledMeshes: THREE.Mesh[] = [];
  const smoked = keep(new THREE.MeshStandardMaterial({ color: 0x120405, roughness: 0.5, transparent: true, opacity: 0.55 }));
  const revLeds = w.groups.rev?.leds ?? [];
  if (revLeds.length) {
    const xs = revLeds.map(i => w.leds[i].x), y = w.leds[revLeds[0]].y;
    const x0 = Math.min(...xs) - 9, x1 = Math.max(...xs) + 9;
    const strip = new THREE.Mesh(keep(new RoundedBoxGeometry((x1 - x0) * k, 16 * k, 0.012, 3, 6 * k)), smoked);
    strip.position.copy(toLocal((x0 + x1) / 2, y, front + 0.078));
    group.add(strip);
  }
  /** Label text as a transparent texture (light letters: they're lit from behind). */
  const labelTexture = (text: string) => {
    const cv = canvas(256, 96), c = cv.getContext("2d")!;
    c.fillStyle = "#ffffff"; c.font = "800 64px 'Chakra Petch', 'Arial Black', sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 128, 52);
    const tx = keep(new THREE.CanvasTexture(cv)); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
    return tx;
  };
  const ENC_LABEL: Record<number, string> = { 12: "ABS", 13: "TC", 14: "BB", 15: "DIFF", 16: "MAP" };

  // Glow: a soft halo per LED in the LED's own colour, at a fixed size (replaces the bloom pass, which clipped colours
  // to white and made pale colours flare more than saturated ones).
  const halo = (() => {
    const cv = canvas(128, 128), c = cv.getContext("2d")!, g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(0.25, "rgba(255,255,255,0.28)"); g.addColorStop(0.6, "rgba(255,255,255,0.07)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return keep(new THREE.CanvasTexture(cv));
  })();
  const glows: THREE.MeshBasicMaterial[] = [];
  /** Flat parts lying on a surface (glows, labels, the window lights, screw sockets): drawn in front of it. */
  const decal = <T extends THREE.Material>(m: T) => { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; return m; };
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false })); // never drawn; still hit by the raycaster
  for (const led of w.leds) {
    const mat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    let mesh: THREE.Mesh;
    let hitR = led.r * 1.8 * k, hitZ = front + 0.09, glowSize = (led.group === "rev" ? 22 : 24) * k, glowZ = front + (led.group === "rev" ? 0.0875 : 0.0735);
    if (led.group === "buttons") {
      // thick black bezel, dark glass cap, the LED as a ring of light round the cap's edge and a glow in the middle
      // where the real caps have their icon (their icons aren't copied); on the pod, or the plate
      const base = onPod(led.x, led.y) ? podTop : front;
      const r = led.r * k, h = 0.045;
      const ctl = new THREE.Group();
      ctl.position.copy(toLocal(led.x, led.y, base));
      ctl.add(new THREE.Mesh(lathe([[r * 0.8, h * 0.95], [r * 0.86, h], [r * 1.02, h], [r * 1.1, h * 0.85], [r * 1.15, h * 0.5], [r * 1.16, 0], [r * 0.8, 0]]), btnBezel));
      ctl.add(new THREE.Mesh(lathe([[0, h * 0.86], [r * 0.4, h * 0.85], [r * 0.66, h * 0.8], [r * 0.76, h * 0.72], [r * 0.79, h * 0.4]], 48), capGlass));
      mesh = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 0.72, r * 0.045, 8, 64)), mat);
      mesh.position.z = h * 0.78;
      ctl.add(mesh);
      const dot = new THREE.Mesh(keep(new THREE.CircleGeometry(r * 0.3, 32)), mat);
      dot.position.z = h * 0.87;
      ctl.add(dot);
      group.add(ctl);
      hitR = led.r * 1.2 * k; hitZ = base + 0.05; glowSize = 44 * k; glowZ = base + 0.6 * mm;
    } else if (led.group === "encoders") {
      // The knob comes up through its window from the housing; the LED shines round the window's edge (a line of
      // light on the housing, seen through the gap) and lights the label in the window's tab.
      const win = windows.find(p => pointInPoly([led.x, led.y], p));
      const ctl = new THREE.Group();
      ctl.position.copy(toLocal(led.x, led.y, 0));
      if (win) {
        const edge = shapeOf(win), inner = inset(win, 2.4);
        edge.holes.push(pathOf(inner));
        decal(mat);
        mesh = new THREE.Mesh(keep(new THREE.ShapeGeometry(edge)), mat);
        mesh.position.set(-(led.x - cx) * k, (led.y - cy) * k, back - 2 * mm); // shape is in wheel coordinates
        ctl.add(mesh);
        // the label sits in the part of the window farthest from the knob (the tab; BB's keyhole)
        const far = win.reduce((a, p) => Math.hypot(p[0] - led.x, p[1] - led.y) > Math.hypot(a[0] - led.x, a[1] - led.y) ? p : a);
        const d = Math.hypot(far[0] - led.x, far[1] - led.y) || 1, at = Math.max(0, d - 13) / d;
        const lx = (far[0] - led.x) * at, ly = (far[1] - led.y) * at, lw = 24 * k;
        const txt = new THREE.Mesh(keep(new THREE.PlaneGeometry(lw, lw * 96 / 256)),
          keep(decal(new THREE.MeshBasicMaterial({ map: labelTexture(ENC_LABEL[led.i] ?? ""), transparent: true, depthWrite: false, color: 0x000000, toneMapped: false }))));
        txt.position.set(lx * k, -ly * k, back - 1 * mm);
        txt.userData.labelFor = led.i;
        ctl.add(txt);
        labelMats[led.i] = txt.material as THREE.MeshBasicMaterial;
      } else {
        mesh = new THREE.Mesh(keep(new THREE.TorusGeometry(18 * k, 0.003, 6, 48)), mat);
        mesh.position.z = front + 0.002;
        ctl.add(mesh);
      }
      // knob: knurled dark ring from the housing up through the window, glossy black top
      const kr = 16 * k, kt = front + 0.055, top = kt + 0.035, k0 = back - 4 * mm; // from the housing's face
      const knurl = new THREE.Mesh(fluted(kr, kt - k0, 12, 0.1), knurlMat);
      knurl.position.z = (kt + k0) / 2;
      ctl.add(knurl);
      ctl.add(new THREE.Mesh(lathe([[0, top], [kr * 0.56, top], [kr * 0.62, top - 0.005], [kr * 0.64, top - 0.014], [kr * 0.64, kt - 0.004]], 48), knobTop));
      group.add(ctl);
      hitR = 22 * k; hitZ = top; glowSize = 70 * k; glowZ = back - 3 * mm;
    } else {
      mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(led.r * 1.05 * k, 20, 12)), mat);
      mesh.scale.z = 0.45;
      mesh.position.copy(toLocal(led.x, led.y, front + 0.072));
      group.add(mesh);
    }
    // Click target: an invisible disc the size of the whole control, level with its top, so a click anywhere on it
    // picks the LED (the lights themselves are thin rings and lines).
    const hit = new THREE.Mesh(keep(new THREE.CircleGeometry(hitR, 24)), hitMat);
    hit.position.copy(toLocal(led.x, led.y, hitZ));
    hit.userData.index = led.i;
    group.add(hit);
    ledMeshes[led.i] = hit;
    ledMats[led.i] = mat;
    // The glow lies flat on the surface the light sits on (light spilling onto it), so the parts above hide the right
    // part of it from every angle; the knobs' glow is on the housing, seen through the windows.
    const gm = keep(decal(new THREE.MeshBasicMaterial({ map: halo, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(glowSize, glowSize)), gm);
    glow.position.copy(toLocal(led.x, led.y, glowZ));
    glow.raycast = () => {}; // never picked instead of the LED
    group.add(glow);
    glows[led.i] = gm;
  }

  // ----- the controls without lights -----
  // funky switch: a small black knob on a knurled ring
  if (w.funky) {
    const kr = w.funky.r * k;
    const ctl = new THREE.Group();
    ctl.position.copy(toLocal(w.funky.x, w.funky.y, front));
    const knurl = new THREE.Mesh(fluted(kr, 0.03, 8, 0.1), knurlMat);
    knurl.position.z = 0.015;
    ctl.add(knurl);
    ctl.add(new THREE.Mesh(lathe([[0, 0.07], [kr * 0.6, 0.068], [kr * 0.78, 0.058], [kr * 0.82, 0.02]], 32), knobTop));
    group.add(ctl);
  }
  // rollers: anodised red knurling
  for (const rl of w.rollers ?? [])
    for (const right of [false, true]) {
      const x = right ? w.size[0] - rl.x : rl.x, r = rl.r * k, len = rl.len * k;
      const ctl = new THREE.Group();
      if (rl.kind === "upright") {
        // on the pod's corner, its axis up the face: a black body, the red knurl below it
        ctl.position.copy(toLocal(x, rl.y, podTop + r * 0.35));
        ctl.rotation.z = THREE.MathUtils.degToRad((rl.tilt ?? 0) * (right ? -1 : 1));
        const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 0.98, r * 0.98, len * 0.5, 48)), blackAlu);
        body.position.y = len * 0.25;
        ctl.add(body);
        const knurl = new THREE.Mesh(flutedY(r, len * 0.46, 10, 0.12), redAlu);
        knurl.position.y = -len * 0.24;
        ctl.add(knurl);
      } else {
        // at the thumb opening's inner edge, rolling up and down: a red knurled wheel, axis across
        ctl.position.copy(toLocal(x, rl.y, front + 0.01));
        const wheelG = new THREE.Mesh(flutedY(r, len, 14, 0.14), redAlu);
        wheelG.rotation.z = Math.PI / 2;
        ctl.add(wheelG);
      }
      ctl.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
      group.add(ctl);
    }
  // screw heads: socket caps, on the pods or the carbon
  {
    const head = lathe([[0, 0.006], [3.2 * k, 0.006], [3.6 * k, 0.004], [3.6 * k, 0]], 24);
    const socket = keep(new THREE.CircleGeometry(1.5 * k, 6));
    const socketMat = keep(decal(new THREE.MeshBasicMaterial({ color: 0x030304 })));
    for (const [sx0, sy] of (w.screws ?? []) as Pt[])
      for (const right of [false, true]) {
        const sx = right ? w.size[0] - sx0 : sx0, base = onPod(sx, sy) ? podTop : front;
        const m = new THREE.Mesh(head, blackAlu);
        m.position.copy(toLocal(sx, sy, base));
        group.add(m);
        const sk = new THREE.Mesh(socket, socketMat);
        sk.position.copy(toLocal(sx, sy, base + 0.0065));
        group.add(sk);
      }
  }

  // ----- quick release half on the back (Simagic-style: black flange, red locking collar, ball-lock bore) -----
  if (w.qr) {
    const q = w.qr;
    const qg = new THREE.Group();
    qg.position.copy(toLocal(q.x, q.y, housingBack));
    qg.rotation.y = Math.PI; // lathe heights run out of the back
    const R = (d: number) => (d / 2) * mm;
    const [fd, fl] = q.flangeMm, [cd, cl] = q.collarMm, [sd, sl] = q.stepMm, [bd, bl] = q.boreMm;
    const z1 = fl * mm, z2 = z1 + cl * mm, z3 = z2 + sl * mm, z4 = z3 + bl * mm, c = 0.8 * mm;
    // profiles below run from the wheel outwards; `lathe` wants them from the far end back (outer faces outwards)
    const ring = (pts: [number, number][]) => lathe([...pts].reverse(), 72);
    // the wheel's mounting plate the flange bolts to, with the six screw heads round it
    qg.add(new THREE.Mesh(lathe([[0, 4 * mm], [R(q.pcdMm + 14) - c, 4 * mm], [R(q.pcdMm + 14), 4 * mm - c], [R(q.pcdMm + 14), -0.5 * mm], [0, -0.5 * mm]], 72), blackAlu));
    const capG = lathe([[0, 2.6 * mm], [3.4 * mm, 2.6 * mm], [4 * mm, 1.8 * mm], [4 * mm, 0]], 24);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const cap = new THREE.Mesh(capG, steel);
      cap.position.set(Math.cos(a) * R(q.pcdMm), Math.sin(a) * R(q.pcdMm), 4 * mm);
      qg.add(cap);
    }
    // the flange that bolts to the wheel (70 mm circle, its screws go into the housing), hollow for the cable
    const f0 = 4 * mm; // the flange starts on the mounting plate
    qg.add(new THREE.Mesh(ring([[R(bd), f0], [R(fd) - c, f0], [R(fd), f0 + c], [R(fd), f0 + z1 - c], [R(fd) - c, f0 + z1], [R(bd), f0 + z1]]), blackAlu));
    const inner = new THREE.Group();
    inner.position.z = f0;
    qg.add(inner);
    // the locking collar: wider, chamfered both ends, a fine groove round its middle
    inner.add(new THREE.Mesh(ring([[R(bd), z1], [R(cd) - c, z1], [R(cd), z1 + c], [R(cd), z1 + cl * mm * 0.48], [R(cd) - 0.4 * mm, z1 + cl * mm * 0.5],
      [R(cd), z1 + cl * mm * 0.52], [R(cd), z2 - c], [R(cd) - c, z2], [R(bd), z2]]), redAlu));
    // a narrower step, then the bore's black sleeve with a bright lip
    inner.add(new THREE.Mesh(ring([[R(bd), z2], [R(sd), z2], [R(sd), z3 - c * 0.6], [R(sd) - c * 0.6, z3], [R(bd), z3]]), redAlu));
    inner.add(new THREE.Mesh(ring([[R(bd) - 3 * mm, z3], [R(bd), z3], [R(bd), z4 - 2 * mm], [R(bd) - 3 * mm, z4 - 2 * mm], [R(bd) - 3 * mm, z3]]), blackAlu));
    const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(R(bd) - 1.5 * mm, 1.3 * mm, 10, 72)), steel);
    lip.position.z = z4 - 1.2 * mm;
    inner.add(lip);
    // inside the bore: the ring of locking balls, the floor and the contact block with its pins
    const ballG = keep(new THREE.SphereGeometry(2.6 * mm, 16, 10));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, rr = R(bd) - 4.2 * mm;
      const ball = new THREE.Mesh(ballG, steel);
      ball.position.set(Math.cos(a) * rr, Math.sin(a) * rr, z3 + 3 * mm);
      inner.add(ball);
    }
    const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(R(bd) - 3 * mm, 48)), housingMat);
    floor.position.z = z1 + 2 * mm;
    inner.add(floor);
    const block = new THREE.Mesh(keep(new THREE.BoxGeometry(14 * mm, 5 * mm, 4 * mm)), housingMat);
    block.position.set(0, -6 * mm, z1 + 4 * mm);
    inner.add(block);
    const pinG = keep(new THREE.CylinderGeometry(0.7 * mm, 0.7 * mm, 2 * mm, 10));
    for (let i = 0; i < 5; i++) {
      const pin = new THREE.Mesh(pinG, gold);
      pin.rotation.x = Math.PI / 2;
      pin.position.set((i - 2) * 2.4 * mm, -6 * mm, z1 + 6.5 * mm);
      inner.add(pin);
    }
    qg.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
    group.add(qg);
  }

  // ----- LEDs -----
  // The wheel is whole from the first frame: no part is animated in (the user's choice). Kept for the stage's API.
  function setBuild(_t: number) {}
  function setLeds(frame: Led[]) {
    for (const led of w.leds) {
      const f = frame[led.i], m = ledMats[led.i];
      if (!f || !m) continue;
      const off = 0.012, a = Math.min(1, f.a);
      const r = f.c[0] * a, g2 = f.c[1] * a, b = f.c[2] * a;
      // the LED itself: its colour with the gain, but its brightest channel never above 1 (past that it clips to white)
      const top = Math.max(r, g2, b), k = top > 0 ? Math.min(LED_GAIN, 1 / top) : 1;
      m.color.setRGB(off + r * k * (1 - off), off + g2 * k * (1 - off), off + b * k * (1 - off));
      // the glow adds light to the surface, so it takes the whole gain
      const g = glows[led.i];
      if (g) g.color.setRGB(r * LED_GAIN, g2 * LED_GAIN, b * LED_GAIN);
      // an encoder's label is lit by its LED (a faint grey when it's off, so it still reads)
      const lm = labelMats[led.i];
      if (lm) lm.color.setRGB(0.18 + r * k * 0.82, 0.18 + g2 * k * 0.82, 0.18 + b * k * 0.82);
    }
  }

  return {
    group, pivot, screenCanvas, screenTexture, ledMeshes, setBuild, setLeds, toLocal,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
