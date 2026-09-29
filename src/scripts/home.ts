// The home page: the live wheel behind six scroll chapters, and everything you can do to it.
import { Stage, webglOk } from "./engine/stage";
import { defaultWheel } from "../data/wheels/index";
import { PRESETS, hex, type RGB } from "./engine/lights";
import { EngineSound } from "./engine/audio";
import { loadIndex, url, type LibraryItem } from "./library";

const host = document.getElementById("stage")!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (webglOk()) {
  const stage = new Stage(host, defaultWheel, { shot: "hero", intro: !reduced });
  host.classList.add("live");
  (window as any).stage = stage;
  const car = stage.car;
  const sound = new EngineSound();
  const forced: Record<string, boolean> = {};
  let revving = false, driving = false;

  // ---------- scroll: blend the camera between the chapters' shots ----------
  const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
  const solid = document.querySelector<HTMLElement>(".after-film");
  let current = "hero";
  function onScroll() {
    const mid = scrollY + innerHeight * 0.5;
    const tops = chapters.map(c => c.offsetTop + c.offsetHeight * 0.5);
    let i = tops.findIndex(t => t > mid);
    if (i === -1) i = tops.length;
    if (i === 0) stage.setShot(chapters[0].dataset.shot!);
    else if (i >= tops.length) stage.setShot(chapters[tops.length - 1].dataset.shot!);
    else stage.blendShots(chapters[i - 1].dataset.shot!, chapters[i].dataset.shot!, (mid - tops[i - 1]) / (tops[i] - tops[i - 1]));
    const near = chapters.reduce((a, c, k) => (Math.abs(tops[k] - mid) < Math.abs(tops[chapters.indexOf(a)] - mid) ? c : a), chapters[0]);
    const shot = near?.dataset.shot ?? "hero";
    if (shot !== current) { current = shot; setDriving(shot === "drive"); }
    // fade the stage out under the solid sections
    const fade = solid ? Math.max(0, Math.min(1, (scrollY + innerHeight - solid.offsetTop - 200) / (innerHeight * 0.6))) : 0;
    host.style.opacity = String(1 - fade * 0.92);
    stage.paused = fade >= 1 && scrollY > (solid?.offsetTop ?? 0) + innerHeight;
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);

  // ---------- presets ----------
  document.querySelectorAll<HTMLButtonElement>("#presets [data-preset]").forEach(b => b.addEventListener("click", () => {
    stage.lights.preset = PRESETS.find(p => p.id === b.dataset.preset)!;
    stage.lights.painted.clear();
    document.querySelectorAll("#presets [data-preset]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));

  // ---------- rev: hold the button or Space ----------
  const revBtn = document.getElementById("rev-btn")!;
  const rev = (on: boolean) => {
    if (driving) return;
    revving = on;
    car.mode = on ? "manual" : "auto";
    car.input.throttle = on ? 1 : 0;
    car.input.brake = 0;
  };
  revBtn.addEventListener("pointerdown", e => { e.preventDefault(); rev(true); });
  addEventListener("pointerup", () => revving && rev(false));

  // ---------- paint: click a light ----------
  const palette = ["#ff1f2d", "#ffb000", "#21e07a", "#22d3ee", "#2f6bff", "#b07cff", "#ff2bd6", "#ffffff"];
  const next = new Map<number, number>();
  stage.onLedClick = i => {
    const k = ((next.get(i) ?? -1) + 1) % (palette.length + 1);
    next.set(i, k);
    stage.lights.painted.set(i, k === palette.length ? null : hex(palette[k]) as RGB);
  };

  // ---------- alerts ----------
  document.querySelectorAll<HTMLButtonElement>("#flags [data-flag]").forEach(b => b.addEventListener("click", () => car.showFlag(b.dataset.flag as any, 5)));
  document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.toggle!;
    forced[k] = !forced[k];
    b.setAttribute("aria-pressed", String(forced[k]));
  }));
  document.getElementById("bias-btn")!.addEventListener("click", () => car.setBias(car.s.brakeBias + (Math.random() < 0.5 ? -0.5 : 0.5)));
  stage.onStep = () => { for (const [k, v] of Object.entries(forced)) if (v) (car.s as any)[k] = true; };

  // ---------- drive ----------
  const hud = document.getElementById("hud")!;
  const hs = document.getElementById("hud-speed")!, hg = document.getElementById("hud-gear")!, hr = document.getElementById("hud-rpm")!;
  function setDriving(on: boolean) {
    driving = on;
    car.mode = on ? "manual" : revving ? "manual" : "auto";
    if (!on) { car.input.throttle = 0; car.input.brake = 0; }
    stage.speedLines = on ? 1 : 0;
    hud.classList.toggle("on", on);
  }
  const keys = new Set<string>();
  addEventListener("keydown", e => {
    if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
    if (e.code === "Space" && current === "rev") { e.preventDefault(); if (!revving) rev(true); return; }
    if (!driving) return;
    if (["KeyW", "ArrowUp", "KeyS", "ArrowDown", "KeyE", "KeyQ", "Space"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "KeyE") car.shiftUp();
    if (e.code === "KeyQ") car.shiftDown();
  });
  addEventListener("keyup", e => {
    keys.delete(e.code);
    if (e.code === "Space" && revving) rev(false);
  });
  const hold = (id: string, set: (v: boolean) => void) => {
    const el = document.getElementById(id)!;
    el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); });
    el.addEventListener("pointerup", () => set(false));
    el.addEventListener("pointercancel", () => set(false));
  };
  const pad = { gas: false, brake: false };
  hold("gas-btn", v => (pad.gas = v));
  hold("brake-btn", v => (pad.brake = v));
  document.getElementById("up-btn")!.addEventListener("click", () => car.shiftUp());
  document.getElementById("down-btn")!.addEventListener("click", () => car.shiftDown());
  const soundBtn = document.getElementById("sound-btn")!;
  soundBtn.addEventListener("click", () => {
    if (sound.on) sound.stop(); else sound.start();
    soundBtn.setAttribute("aria-pressed", String(sound.on));
  });

  stage.onFrame = () => {
    if (driving) {
      car.input.throttle = keys.has("KeyW") || keys.has("ArrowUp") || pad.gas ? 1 : 0;
      car.input.brake = keys.has("KeyS") || keys.has("ArrowDown") || pad.brake ? 1 : 0;
      // automatic upshift at the limiter if the visitor doesn't use the paddles
      if (car.s.limiter && car.input.throttle && car.s.gear < 6) car.shiftUp();
      if (car.s.rpm < 2600 && car.s.gear > 1) car.shiftDown();
      hs.textContent = String(Math.round(car.s.speed));
      hg.textContent = car.s.gearText;
      hr.textContent = String(Math.round(car.s.rpm / 10) * 10);
    }
    sound.update(car.s.rpm, car.s.throttle, car.s.limiter);
  };

  onScroll(); // after everything it uses exists

  // ---------- dashes from the library ----------
  loadIndex().then(index => {
    const dashes = index.Items.filter(i => i.Kind === "dash");
    const chips = document.getElementById("dash-chips")!, meta = document.getElementById("dash-meta")!;
    chips.innerHTML = "";
    const show = async (item: LibraryItem, btn: HTMLElement) => {
      chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      const d = await (await fetch(url(item.DashUrl))).json();
      stage.setDash(d);
      meta.textContent = `${item.Name} by ${item.Author} · ${item.Description ?? ""}`;
    };
    dashes.forEach((item, i) => {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = item.Name;
      b.addEventListener("click", () => show(item, b));
      chips.appendChild(b);
      if (i === 0) show(item, b);
    });
    // library teaser cards
    const row = document.getElementById("lib-row")!;
    for (const item of index.Items.slice(0, 6)) {
      const a = document.createElement("a");
      a.className = "lib-card reveal in"; a.href = `/library/#${item.Kind}-${item.Id}`;
      a.innerHTML = `<img loading="lazy" alt="" src="${url(item.PreviewUrl)}"><div><b></b><p class="small muted"></p></div>`;
      a.querySelector("b")!.textContent = item.Name;
      a.querySelector("p")!.textContent = `${item.Kind === "saver" ? "Screensaver" : "Dash"} by ${item.Author}`;
      row.appendChild(a);
    }
  }).catch(() => { document.getElementById("dash-chips")!.textContent = "The library isn't reachable right now."; });
}
