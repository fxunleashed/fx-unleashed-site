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
  // thumb openings: rounded boxes through the faceplate, both sides
  const roundedBox = (x: number, y: number, bw: number, bh: number, r: number) => {
    const h = new THREE.Path(), n = 10, c: [number, number][] = [];
    const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; c.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(x + bw - r, y + r, -Math.PI / 2); corner(x + bw - r, y + bh - r, 0); corner(x + r, y + bh - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
    c.forEach(([px, py], i) => { const v = P(px, py); if (i === 0) h.moveTo(v.x, v.y); else h.lineTo(v.x, v.y); });
    h.closePath();
    return h;
  };
  for (const c of w.cutouts ?? [])
    for (const x of [c.x, w.size[0] - c.x - c.w]) shape.holes.push(roundedBox(x, c.y, c.w, c.h, c.r));
  const bodyGeo = keep(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: 0.022, bevelSegments: seg, curveSegments: 48, steps: 1,
  }));
  bodyGeo.translate(0, 0, -depth / 2);
  const carbon = carbonTextures();
  for (const t of Object.values(carbon)) { t.repeat.set(4, 4); t.anisotropy = 16; keep(t); }
  const bodyMat = keep(new THREE.MeshPhysicalMaterial({
    ...carbon, color: 0xffffff, metalness: 0.05, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.45,
    normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.35, // matte-ish: no sheet of reflected light across the face as it turns
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // ----- grips: each grip's polygon (left side, mirrored), thicker than the plate and well rounded, soft rubber -----
  const gripMat = keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.92, metalness: 0, bumpMap: keep(noiseTexture(128, 60)), bumpScale: 0.35 }));
  const grips: THREE.Mesh[] = [];
  for (const gdef of w.grips ?? []) {
    for (const right of [false, true]) {
      const poly = gdef.points.map(([x, y]) => [right ? w.size[0] - x : x, y] as [number, number]);
      if (poly.length < 3) continue;
      const gs = new THREE.Shape(), gp = poly.map(([x, y]) => P(x, y));
      gs.moveTo(gp[0].x, gp[0].y); for (const q of gp.slice(1)) gs.lineTo(q.x, q.y); gs.closePath();
      // a thin core with a big bevel pulled inwards: a nearly round cross-section, the outline unchanged
      const gd = 0.24, round = 0.13; // 0.5 thick in all, the faceplate is 0.34
      const gg = keep(new THREE.ExtrudeGeometry(gs, { depth: gd, bevelEnabled: true, bevelThickness: round, bevelSize: round, bevelOffset: -round, bevelSegments: Math.max(8, seg), curveSegments: 24 }));
      gg.translate(0, 0, -gd / 2 - 0.03); // a little further back than forward, like the real handles
      const grip = new THREE.Mesh(gg, gripMat);
      grip.castShadow = grip.receiveShadow = true;
      grips.push(grip);
      group.add(grip);
    }
  }

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
  const rimMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.035, 0.05), toneMapped: false }));
  const rim = new THREE.Mesh(keep(new THREE.TubeGeometry(rimCurve, 600, 0.008, 8, true)), rimMat);
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
  const screenMat = keep(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95) })); // under the bloom threshold: text stays crisp
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(s.w * k, s.h * k)), screenMat);
  screen.position.copy(toLocal(s.x + s.w / 2, s.y + s.h / 2, front + 0.0712));
  group.add(screen);
  // glass over the screen: catches reflections
  const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.12, envMapIntensity: 1.2 }));
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
  // Buttons and encoders, modelled on the real wheel (checked against the maker's product photos):
  // - a button: thick black bezel, dark glass cap, the LED as a ring of light round the cap's edge and a glow in the
  //   middle where the real caps have their icon (their icons aren't copied);
  // - an encoder: a black plate (a circle with a label tab, BB a keyhole) edged with a thin line of light, the tab lit
  //   with its label, and a black knob on a dark knurled ring.
  const btnBezel = keep(new THREE.MeshStandardMaterial({ color: 0x121317, metalness: 0.5, roughness: 0.45 }));
  const capGlass = keep(new THREE.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  const knurlMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3d43, metalness: 0.85, roughness: 0.4 }));
  const knobTop = keep(new THREE.MeshPhysicalMaterial({ color: 0x0a0b0d, metalness: 0.2, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
  const plateMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, metalness: 0.4, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 }));
  const upright = <T extends THREE.BufferGeometry>(g: T) => { g.rotateX(Math.PI / 2); return g; }; // axis Y -> out of the face
  /** Lathe profile [radius, height] in world units (listed from the top down), stood up on the face. */
  const lathe = (pts: [number, number][], seg = 64) =>
    keep(upright(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)).reverse(), seg)));
  /** A cylinder with rounded flutes round its side (the knurled ring). */
  const fluted = (r: number, h: number, flutes: number, depth: number) => {
    const g = new THREE.CylinderGeometry(r, r, h, flutes * 8, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
      if (rr < r * 0.5) continue;
      const f = 1 - depth * Math.pow(Math.max(0, Math.cos(Math.atan2(z, x) * flutes)), 2);
      pos.setX(i, x * f); pos.setZ(i, z * f);
    }
    g.computeVertexNormals();
    return keep(upright(g));
  };
  /** Label text as a transparent texture (dark letters for a lit tab). */
  const labelTexture = (text: string) => {
    const cv = canvas(256, 96), c = cv.getContext("2d")!;
    c.fillStyle = "#050506"; c.font = "800 64px 'Chakra Petch', 'Arial Black', sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 128, 52);
    const tx = keep(new THREE.CanvasTexture(cv)); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
    return tx;
  };
  // encoder plates, in definition units round the knob: [label, tab direction (x, y down), tab kind]
  const ENC: Record<number, [string, number, number, "tab" | "key"]> = {
    12: ["ABS", 1, 1, "tab"], 13: ["TC", -1, 1, "tab"], 14: ["BB", 0, 1, "key"], 15: ["DIFF", 1, -1, "tab"], 16: ["MAP", -1, -1, "tab"],
  };
  /** Plate outline: for each direction, the distance to the edge of (circle R) + (tab), sampled along the ray. */
  const plateRadii = (R: number, dx: number, dy: number, kind: "tab" | "key", n = 160) => {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    // tab: a rounded box centred out along the direction; key: a narrower one straight down
    const cxT = ux * R * (kind === "key" ? 1.05 : 0.8), cyT = uy * R * (kind === "key" ? 1.05 : 0.8);
    const hw = R * (kind === "key" ? 0.46 : 0.74), hh = R * (kind === "key" ? 0.5 : 0.74), cr = R * 0.2;
    const inTab = (x: number, y: number) => {
      const qx = Math.abs(x - cxT) - (hw - cr), qy = Math.abs(y - cyT) - (hh - cr);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= cr;
    };
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      let d = R;
      for (let s = R; s < R * 2.6; s += R * 0.01) if (inTab(cx * s, cy * s)) d = s;
      out.push(d);
    }
    // soften the joins between circle and tab
    return out.map((_, i) => { let s = 0; for (let j = -3; j <= 3; j++) s += out[(i + j + n) % n]; return s / 7; });
  };
  const outlineShape = (radii: number[], inset: number, sx: number, sy: number) => {
    const s = new THREE.Shape(), n = radii.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = (radii[i] - inset) * k;
      const x = Math.cos(a) * r * sx, y = -Math.sin(a) * r * sy; // definition y is down
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  };

  for (const led of w.leds) {
    const mat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    let mesh: THREE.Mesh;
    if (led.group === "buttons") {
      const r = led.r * k, h = 0.045;
      const ctl = new THREE.Group();
      ctl.position.copy(toLocal(led.x, led.y, front));
      // bezel: a thick ring with rounded top edges
      ctl.add(new THREE.Mesh(lathe([[r * 0.8, h * 0.95], [r * 0.86, h], [r * 1.02, h], [r * 1.1, h * 0.85], [r * 1.15, h * 0.5], [r * 1.16, 0], [r * 0.8, 0]]), btnBezel));
      // dark glass cap, slightly domed, sunk a little into the bezel
      ctl.add(new THREE.Mesh(lathe([[0, h * 0.86], [r * 0.4, h * 0.85], [r * 0.66, h * 0.8], [r * 0.76, h * 0.72], [r * 0.79, h * 0.4]], 48), capGlass));
      // the LED: a ring of light round the cap's edge and a soft glow in the middle
      mesh = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 0.72, r * 0.045, 8, 64)), mat);
      mesh.position.z = h * 0.78;
      ctl.add(mesh);
      const dot = new THREE.Mesh(keep(new THREE.CircleGeometry(r * 0.3, 32)), mat);
      dot.position.z = h * 0.87;
      ctl.add(dot);
      group.add(ctl);
    } else if (led.group === "encoders") {
      const [label, dx, dy, kind] = ENC[led.i] ?? ["", 0, 1, "key"];
      const R = 25; // plate radius round the knob, definition units
      const radii = plateRadii(R, dx, dy, kind);
      const ctl = new THREE.Group();
      ctl.position.copy(toLocal(led.x, led.y, front));
      // black plate, a little proud of the carbon
      const plateGeo = keep(new THREE.ExtrudeGeometry(outlineShape(radii, 1.2, 1, 1), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }));
      ctl.add(new THREE.Mesh(plateGeo, plateMat));
      // the LED: a thin line of light round the plate's edge
      const edge = outlineShape(radii, 0, 1, 1);
      const inner = outlineShape(radii, 2.2, 1, 1);
      edge.holes.push(new THREE.Path(inner.getPoints().reverse()));
      mesh = new THREE.Mesh(keep(new THREE.ShapeGeometry(edge)), mat);
      mesh.position.z = 0.0175;
      ctl.add(mesh);
      // lit label tab
      if (label) {
        // the lit label sits in the tab's outer corner, level (as on the wheel)
        const lx = kind === "key" ? 0 : dx * R * 0.72, ly = kind === "key" ? R * 1.3 : dy * R * 0.98;
        const lw = (kind === "key" ? 0.62 : 1.0) * R, lh = (kind === "key" ? 0.42 : 0.46) * R;
        const tab = new THREE.Mesh(keep(new RoundedBoxGeometry(lw * k, lh * k, 0.002, 2, 0.12 * R * k)), mat);
        tab.position.set(lx * k, -ly * k, 0.0175);
        ctl.add(tab);
        const txt = new THREE.Mesh(keep(new THREE.PlaneGeometry(lw * k * 0.95, lw * k * 0.95 * 96 / 256)),
          keep(new THREE.MeshBasicMaterial({ map: labelTexture(label), transparent: true, depthWrite: false })));
        txt.position.set(lx * k, -ly * k, 0.0195);
        ctl.add(txt);
      }
      // knob: knurled dark ring at the base, glossy black top
      const kr = 16 * k, kh = 0.055, kt = 0.014 + kh, top = kt + 0.035;
      const knurl = new THREE.Mesh(fluted(kr, kh, 12, 0.1), knurlMat);
      knurl.position.z = 0.014 + kh / 2;
      ctl.add(knurl);
      // flat black top with a small chamfer, standing on the knurled ring
      ctl.add(new THREE.Mesh(lathe([[0, top], [kr * 0.56, top], [kr * 0.62, top - 0.005], [kr * 0.64, top - 0.014], [kr * 0.64, kt - 0.004]], 48), knobTop));
      group.add(ctl);
    } else {
      mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(led.r * 1.05 * k, 20, 12)), mat);
      mesh.scale.z = 0.45;
      mesh.position.copy(toLocal(led.x, led.y, front + 0.072));
      group.add(mesh);
    }
    mesh.userData.index = led.i;
    ledMeshes[led.i] = mesh;
    ledMats[led.i] = mat;
  }

  // the 7-way switch below BB: a small black knob on a knurled ring, no light
  {
    const sx = w.size[0] / 2, sy = 311, kr = 8.5 * k;
    const ctl = new THREE.Group();
    ctl.position.copy(toLocal(sx, sy, front));
    const knurl = new THREE.Mesh(fluted(kr, 0.03, 8, 0.1), knurlMat);
    knurl.position.z = 0.015;
    ctl.add(knurl);
    ctl.add(new THREE.Mesh(lathe([[0, 0.07], [kr * 0.6, 0.068], [kr * 0.78, 0.058], [kr * 0.82, 0.02]], 32), knobTop));
    group.add(ctl);
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
  const parts = group.children.filter(c => c !== body && !grips.includes(c as THREE.Mesh));
  function setBuild(t: number) {
    const e = 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    body.scale.z = Math.max(0.001, e);
    for (const g of grips) g.scale.z = Math.max(0.001, e);
    rimMat.color.setRGB(0.5 * e, 0.035 * e, 0.05 * e);
    for (const [i, p] of parts.entries()) {
      const at = Math.max(0, Math.min(1, (t - 0.35 - (i / parts.length) * 0.4) / 0.25));
      p.visible = at > 0;
    }
  }
  function setLeds(frame: Led[]) {
    for (const led of w.leds) {
      const f = frame[led.i], m = ledMats[led.i];
      if (!f || !m) continue;
      const boost = led.group === "buttons" ? 1.4 : led.group === "encoders" ? 1.05 : 1.6;
      const off = 0.012;
      const a = f.a;
      // HDR colour when lit (the bloom pass makes the glow)
      m.color.setRGB(off + f.c[0] * a * boost, off * 0.95 + f.c[1] * a * boost, off + f.c[2] * a * boost);
    }
  }

  return {
    group, pivot, screenCanvas, screenTexture, ledMeshes, setBuild, setLeds, toLocal,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
