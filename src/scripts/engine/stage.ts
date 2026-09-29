// The 3D stage used by every page with a wheel: renderer, lighting, bloom and a film finish, camera "shots" the
// page scrolls between, pointer parallax, the build-in intro, LED picking, and the live screen (dash or saver).
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Wheel } from "../../data/wheels/index";
import { buildWheel, type WheelModel } from "./wheel3d";
import { Car } from "./demo";
import { LightEngine } from "./lights";
import { DashRenderer, drawLogoSaver, type Dash } from "./dashRender";

export interface Shot { cam: [number, number, number]; look: [number, number, number]; rot: [number, number, number]; fov?: number }

// Camera positions around the wheel (world units: 1 = 10 cm; the wheel is ~3 wide, facing +z)
export const SHOTS: Record<string, Shot> = {
  hero: { cam: [-1.55, 0.05, 5.9], look: [-1.6, -0.05, 0], rot: [0.06, -0.38, 0.02] },
  heroNarrow: { cam: [0, -1.0, 7.4], look: [0, -1.05, 0], rot: [0.1, -0.2, 0] },
  front: { cam: [0, 0, 5.2], look: [0, 0, 0], rot: [0, 0, 0] },
  rev: { cam: [-0.55, 1.1, 2.9], look: [-0.62, 0.6, 0], rot: [0.28, 0.08, 0] },       // panel on the left: the bar sits right of it
  screen: { cam: [0.52, 0.48, 2.95], look: [0.58, 0.44, 0], rot: [0.05, -0.08, 0] },    // panel on the right: the screen sits left of it
  controls: { cam: [-0.2, -0.45, 3.3], look: [-0.75, -0.3, 0], rot: [-0.14, 0.3, 0.04] }, // panel on the left
  drive: { cam: [0.55, -0.35, 4.3], look: [0.75, 0.2, 0], rot: [0.12, -0.05, 0] },   // panel on the right
  back: { cam: [-2.4, -0.9, -3.9], look: [0.2, 0.1, 0], rot: [0.05, 0.35, 0] },
  side: { cam: [4.4, 0.6, 2.4], look: [0, 0, 0], rot: [0, -0.1, 0] },
  lab: { cam: [-0.75, 0.05, 5.9], look: [-0.8, 0.02, 0], rot: [0, 0, 0] },
  labNarrow: { cam: [0, 0.9, 7.2], look: [0, 0.9, 0], rot: [0, 0, 0] },
  card: { cam: [0, 0.2, 5.0], look: [0, 0.05, 0], rot: [0.05, -0.25, 0] },
};

const FilmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 1.1 }, grain: { value: 0.045 }, aberration: { value: 0.0016 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform float grain; uniform float aberration;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r = texture2D(tDiffuse, vUv + d * aberration).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - d * aberration).b;
      vec3 c = vec3(r, g, b);
      c *= smoothstep(0.95, 0.2, length(d) * vignette);
      c += (rand(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export interface StageOptions {
  shot?: string;
  intro?: boolean;          // play the build-in
  interactive?: boolean;    // pointer parallax + LED picking
  transparent?: boolean;
  quality?: "high" | "low";
  particles?: boolean;
}

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  film: ShaderPass;
  model: WheelModel;
  car = new Car();
  lights: LightEngine;
  dash: DashRenderer | null = null;
  screenMode: "saver" | "dash" | "image" | "off" = "saver";
  screenImage: HTMLImageElement | null = null;
  onLedClick: ((index: number, e: PointerEvent) => void) | null = null;
  onFrame: ((t: number, dt: number) => void) | null = null;
  /** After the car moved, before the lights are worked out (pages force alerts here). */
  onStep: (() => void) | null = null;
  hoverLed = -1;
  paused = false;
  speedLines = 0;         // 0..1, streaks when driving
  autoSpin = 0;           // rad/s around y (turntable)

  private shot: Shot;
  private cur = { cam: new THREE.Vector3(), look: new THREE.Vector3(), rot: new THREE.Euler() };
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private t = 0;
  private buildStart = 0;
  private screenAt = 0;
  private logo = new Image();
  private particles?: THREE.Points;
  private streaks?: THREE.LineSegments;
  private aura: THREE.Mesh;
  private raf = 0;
  private visible = true;
  private ctx: CanvasRenderingContext2D;
  private disposeFns: (() => void)[] = [];

  constructor(private host: HTMLElement, public wheel: Wheel, private opts: StageOptions = {}) {
    const low = opts.quality === "low" || matchMedia("(max-width: 700px)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: !!opts.transparent, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add("stage-canvas");

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55; // the room's lights, reflected in the clear coat, stay under the bloom threshold
    if (!opts.transparent) this.scene.background = new THREE.Color(0x050608);
    this.scene.fog = new THREE.Fog(0x050608, 9, 22);

    // lights: a soft key from above-front, a red rim from behind, a cool fill
    const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(2, 4, 5); this.scene.add(key);
    const rimL = new THREE.PointLight(0xff1f2d, 30, 12, 2); rimL.position.set(-2.5, 1.5, -2.5); this.scene.add(rimL);
    const fill = new THREE.DirectionalLight(0x6a8cff, 0.35); fill.position.set(-4, -2, 3); this.scene.add(fill);

    // a red aura behind the wheel
    const auraTex = this.radial("rgba(255,31,45,0.55)", "rgba(255,31,45,0)");
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ map: auraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    this.aura.position.set(0, 0, -2.8);
    this.scene.add(this.aura);

    this.model = buildWheel(wheel, { quality: low ? "low" : "high" });
    this.scene.add(this.model.pivot);
    this.ctx = this.model.screenCanvas.getContext("2d")!;
    this.lights = new LightEngine(wheel);
    this.logo.src = "/brand/logo-nobg.png";

    if (opts.particles !== false) this.makeParticles(low ? 250 : 700);
    this.makeStreaks();

    // post: bloom for the LEDs and screen, then tone mapping, then a film finish
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), low ? 0.85 : 1.05, 0.5, 1.0); // threshold 1: only HDR emitters glow
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.film);

    this.shot = SHOTS[opts.shot ?? "hero"];
    this.shot = this.resolve(opts.shot ?? "hero") ?? this.shot;
    this.cur.cam.fromArray(this.shot.cam).add(new THREE.Vector3(0, 0, opts.intro ? 2.5 : 0));
    this.cur.look.fromArray(this.shot.look);
    this.cur.rot.set(...(this.shot.rot));
    this.model.setBuild(opts.intro ? 0 : 1);
    this.lights.ignite = opts.intro ? 0 : 1;
    this.buildStart = opts.intro ? 0.25 : -10;
    this.screenAt = opts.intro ? 0 : -10;
    if (!opts.intro) this.screenMode = "dash";

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.disposeFns.push(() => ro.disconnect());
    const io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; });
    io.observe(host);
    this.disposeFns.push(() => io.disconnect());
    if (opts.interactive !== false) this.bindPointer();
    this.resize();
    this.loop();
  }

  private radial(inner: string, outer: string) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  private makeParticles(n: number) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = (Math.random() - 0.5) * 9; pos[i * 3 + 2] = -Math.random() * 12 + 2;
      const red = Math.random() < 0.35;
      col[i * 3] = red ? 1 : 0.8; col[i * 3 + 1] = red ? 0.15 : 0.82; col[i * 3 + 2] = red ? 0.2 : 0.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.035, map: this.radial("rgba(255,255,255,1)", "rgba(255,255,255,0)"), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.particles = new THREE.Points(g, m);
    this.scene.add(this.particles);
  }

  private makeStreaks() {
    const n = 90, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 14, y = (Math.random() - 0.5) * 8, z = -Math.random() * 20;
      pos.set([x, y, z, x, y, z - 1.2], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff3b47, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.streaks);
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.hoverLed = this.pick();
      el.style.cursor = this.hoverLed >= 0 && this.onLedClick ? "pointer" : "";
    };
    const click = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const i = this.pick();
      if (i >= 0 && this.onLedClick) this.onLedClick(i, e);
    };
    window.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerdown", click);
    this.disposeFns.push(() => { window.removeEventListener("pointermove", move); el.removeEventListener("pointerdown", click); });
  }

  private pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.model.ledMeshes.filter(Boolean), false)[0];
    return hit ? (hit.object.userData.index as number) : -1;
  }

  private narrow() { return this.host.clientWidth / Math.max(1, this.host.clientHeight) < 0.9; }
  /**
   * Portrait screens: a shot's "Narrow" twin if it has one, else one derived from it: centred (the side panels stack
   * under the wheel there), pulled back, and the wheel raised into the top half of the screen.
   */
  private resolve(name: string): Shot | undefined {
    const s = SHOTS[name];
    if (!s || !this.narrow()) return s;
    if (SHOTS[name + "Narrow"]) return SHOTS[name + "Narrow"];
    const dx = s.cam[0] - s.look[0];
    return { cam: [dx, s.cam[1] - 0.95, s.cam[2] * 1.45 + 0.6], look: [0, s.look[1] - 0.95, s.look[2]], rot: s.rot };
  }
  setShot(name: string) { const s = this.resolve(name); if (s) this.shot = s; }
  /** Blends between two shots (scroll-driven pages). */
  blendShots(a: string, b: string, t: number) {
    const A = this.resolve(a), B = this.resolve(b); if (!A || !B) return;
    const e = t * t * (3 - 2 * t);
    const lerp = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * e) as [number, number, number];
    this.shot = { cam: lerp(A.cam, B.cam), look: lerp(A.look, B.look), rot: lerp(A.rot, B.rot) };
  }
  setDash(d: Dash | null) { this.dash = d ? new DashRenderer(d) : null; if (d) this.screenMode = "dash"; }
  showImage(src: string) { const img = new Image(); img.src = src; this.screenImage = img; this.screenMode = "image"; }
  replayIntro() { this.buildStart = this.t + 0.1; this.screenAt = this.t; this.screenMode = "saver"; this.lights.ignite = 0; this.model.setBuild(0); }

  resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the wheel in frame on narrow screens
    this.camera.fov = w / h < 1 ? 32 / Math.max(0.55, w / h) : 32;
    this.camera.updateProjectionMatrix();
  }

  private drawScreen() {
    const c = this.ctx;
    if (this.screenMode === "saver") drawLogoSaver(c, this.logo, this.t);
    else if (this.screenMode === "dash" && this.dash) this.dash.draw(c, this.car);
    else if (this.screenMode === "image" && this.screenImage?.complete) { c.fillStyle = "#000"; c.fillRect(0, 0, 800, 480); c.drawImage(this.screenImage, 0, 0, 800, 480); }
    else { c.fillStyle = "#000"; c.fillRect(0, 0, 800, 480); }
    this.model.screenTexture.needsUpdate = true;
  }

  private screenTick = 0;

  /** Tests and screenshots: runs `seconds` of the stage now (in 1/30 s steps), then renders. */
  advance(seconds: number) {
    for (let s = 0; s < seconds; s += 1 / 30) this.frame(1 / 30, false);
    this.frame(1 / 30, true);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.visible || this.paused) return; // hidden tabs: the browser already throttles rAF
    this.frame(dt, true);
  };

  private frame(dt: number, render: boolean) {
    this.t += dt;
    const t = this.t;

    // intro: body extrudes, parts appear, LEDs ignite, screen boots on the logo then the dash
    if (t - this.buildStart < 3) {
      const b = (t - this.buildStart) / 1.8;
      this.model.setBuild(b);
      this.lights.ignite = Math.max(0, Math.min(1, (t - this.buildStart - 1.4) / 1.2));
    }
    if (this.screenMode === "saver" && this.screenAt >= 0 && t - this.screenAt > 4.2 && this.dash) this.screenMode = "dash";

    this.car.step(dt);
    this.onStep?.();
    this.model.setLeds(this.lights.frame(this.car.s, t));
    this.screenTick += dt;
    if (this.screenTick > 1 / 30) { this.screenTick = 0; this.drawScreen(); }

    // camera: glide to the shot, pointer parallax, gentle float
    const k = 1 - Math.exp(-dt * 3.2);
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 4));
    this.cur.cam.lerp(new THREE.Vector3(...this.shot.cam), k);
    this.cur.look.lerp(new THREE.Vector3(...this.shot.look), k);
    this.camera.position.copy(this.cur.cam);
    this.camera.lookAt(this.cur.look);
    const p = this.model.pivot;
    const rx = this.shot.rot[0] - this.pointerSmooth.y * 0.12, ry = this.shot.rot[1] + this.pointerSmooth.x * 0.22, rz = this.shot.rot[2];
    p.rotation.x += (rx + Math.sin(t * 0.6) * 0.015 - p.rotation.x) * k;
    p.rotation.y += (ry + this.autoSpin * t - p.rotation.y) * (this.autoSpin ? 1 : k);
    p.rotation.z += (rz - (this.car.mode === "manual" ? 0 : 0) - p.rotation.z) * k;
    p.position.y = Math.sin(t * 0.8) * 0.025;

    if (this.particles) { this.particles.rotation.y = t * 0.01; (this.particles.material as THREE.PointsMaterial).opacity = 0.45 + 0.1 * Math.sin(t); }
    if (this.streaks) {
      const m = this.streaks.material as THREE.LineBasicMaterial;
      m.opacity += (this.speedLines * Math.min(1, this.car.s.speed / 200) * 0.7 - m.opacity) * k;
      this.streaks.position.z = (t * 18 * (0.3 + this.car.s.speed / 150)) % 20;
    }
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.35 + (this.car.s.shift ? 0.35 : 0) + 0.05 * Math.sin(t * 1.3);
    (this.film.uniforms as any).time.value = t;
    this.onFrame?.(t, dt);
    if (render) this.composer.render(dt);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const f of this.disposeFns) f();
    this.model.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** WebGL available (else pages show a still picture). */
export function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
