// The home page: the live wheel behind the scroll chapters, with its lights, dashes and alerts to try.
import { webglOk } from "./engine/webgl";
import type { Stage as StageT } from "./engine/stage";
import { defaultWheel } from "../data/wheels/index";
import { PRESETS, hex, type RGB } from "./engine/lights";
import { loadIndex, url, type LibraryItem } from "./library";

const host = document.getElementById("stage")!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const boot = document.getElementById("boot");
let unbooted = false;
const unboot = () => {
  if (unbooted) return;
  unbooted = true;
  boot?.classList.add("gone");
  setTimeout(() => boot?.remove(), 1200); // after its fade: hidden, it still ran its animations (13 dots, a filtered logo) every frame
};
setTimeout(unboot, 2500); // never hold the page for the 3D

// the stats count up when they first show
for (const dt of document.querySelectorAll<HTMLElement>("[data-count]")) {
  const to = +dt.dataset.count!, t0 = performance.now();
  const step = (now: number) => { const k = Math.min(1, (now - t0) / 1400); dt.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

if (!webglOk()) unboot();
else (async () => {
  const { Stage } = await import("./engine/stage"); // three.js in its own chunk: the text shows first
  const stage: StageT = new Stage(host, defaultWheel, { shot: "hero", intro: !reduced });
  unboot();
  host.classList.add("live");
  (window as any).stage = stage;
  const car = stage.car;
  const forced: Record<string, boolean> = {};

  // ---------- scroll: blend the camera between the chapters' shots ----------
  const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
  const solid = document.querySelector<HTMLElement>(".after-film");
  function onScroll() {
    const mid = scrollY + innerHeight * 0.5;
    const tops = chapters.map(c => c.offsetTop + c.offsetHeight * 0.5);
    let i = tops.findIndex(t => t > mid);
    if (i === -1) i = tops.length;
    if (i === 0) stage.setShot(chapters[0].dataset.shot!);
    else if (i >= tops.length) stage.setShot(chapters[tops.length - 1].dataset.shot!);
    else stage.blendShots(chapters[i - 1].dataset.shot!, chapters[i].dataset.shot!, (mid - tops[i - 1]) / (tops[i] - tops[i - 1]));
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
  stage.onStep = () => {
    for (const [k, v] of Object.entries(forced)) if (v) (car.s as any)[k] = true;
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
})();
