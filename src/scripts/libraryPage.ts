// The library page: filters, cards whose preview comes alive on hover, and the item viewer with the dash on a live
// 3D wheel, plugin install and download.
import { loadIndex, url, pluginState, installInPlugin, type LibraryItem, type PluginState } from "./library";
import { Car } from "./engine/demo";
import { DashRenderer } from "./engine/dashRender";
import { Stage, webglOk } from "./engine/stage";
import { defaultWheel } from "../data/wheels/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const grid = $("grid"), empty = $("empty"), q = $<HTMLInputElement>("q"), game = $<HTMLSelectElement>("game"), sort = $<HTMLSelectElement>("sort");
let items: LibraryItem[] = [];
let kind = "all";
const tagsOn = new Set<string>();
let plugin: PluginState = { available: false };
const dashCache = new Map<string, Promise<any>>();
const getDash = (i: LibraryItem) => {
  const k = i.Kind + i.Id;
  if (!dashCache.has(k)) {
    const p = fetch(url(i.DashUrl)).then(r => { if (!r.ok) throw new Error(`${i.DashUrl}: ${r.status}`); return r.json(); });
    p.catch(() => dashCache.delete(k)); // a failed load is tried again next time, not remembered
    dashCache.set(k, p);
  }
  return dashCache.get(k)!;
};

// one car for every live preview (they all show the same lap)
const car = new Car();
let lastT = performance.now();
const live = new Set<{ r: DashRenderer; ctx: CanvasRenderingContext2D }>();
function tick(now: number) {
  requestAnimationFrame(tick);
  if (!live.size) { lastT = now; return; }
  car.step((now - lastT) / 1000); lastT = now;
  for (const l of live) l.r.draw(l.ctx, car);
}
requestAnimationFrame(tick);

function card(i: LibraryItem) {
  const el = document.createElement("article");
  el.className = "lib-item";
  el.id = `${i.Kind}-${i.Id}`;
  el.tabIndex = 0;
  el.innerHTML = `<div class="shot"><img loading="lazy" alt=""><canvas width="800" height="480"></canvas><span class="live-tag">LIVE</span><span class="kind"></span></div>
    <div class="meta"><h3></h3><p class="by"></p></div>`;
  (el.querySelector("img") as HTMLImageElement).src = url(i.PreviewUrl);
  el.querySelector(".kind")!.textContent = i.Kind === "saver" ? "Screensaver" : "Dash";
  el.querySelector("h3")!.textContent = i.Name;
  const inst = plugin.installed?.find(x => x.id === i.Id && x.kind === i.Kind);
  const by = el.querySelector(".by")!;
  by.textContent = `by ${i.Author}${i.Games?.length ? " · " + i.Games.slice(0, 3).join(", ") : ""}`;
  if (inst) { const s = document.createElement("span"); s.className = "installed"; s.textContent = " · installed"; by.appendChild(s); }

  // hover: the dash runs, the card tilts toward the pointer
  const canvas = el.querySelector("canvas")!;
  let entry: { r: DashRenderer; ctx: CanvasRenderingContext2D } | null = null;
  el.addEventListener("pointerenter", async () => {
    const d = await getDash(i);
    entry = { r: new DashRenderer(d), ctx: canvas.getContext("2d")! };
    live.add(entry); el.classList.add("live");
  });
  el.addEventListener("pointerleave", () => { if (entry) live.delete(entry); el.classList.remove("live"); el.style.transform = ""; });
  el.addEventListener("pointermove", e => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(10px)`;
  });
  el.addEventListener("click", () => open(i));
  el.addEventListener("keydown", e => { if (e.key === "Enter") open(i); });
  return el;
}

function render() {
  const text = q.value.trim().toLowerCase(), g = game.value;
  let list = items.filter(i => (kind === "all" || i.Kind === kind)
    && (!g || i.Games?.includes(g))
    && [...tagsOn].every(t => i.Tags?.includes(t))
    && (!text || [i.Name, i.Author, i.Description, ...(i.Tags ?? []), ...(i.Cars ?? []), ...(i.Games ?? [])].some(x => x?.toLowerCase().includes(text))));
  if (sort.value === "name") list = list.sort((a, b) => a.Name.localeCompare(b.Name));
  else if (sort.value === "light") list = list.sort((a, b) => (a.BytesPerSecond ?? 0) - (b.BytesPerSecond ?? 0));
  else list = list.sort((a, b) => (b.Updated ?? "").localeCompare(a.Updated ?? ""));
  live.clear();
  grid.replaceChildren(...list.map(card));
  empty.hidden = list.length > 0;
}

function tags() {
  const all = [...new Set(items.flatMap(i => i.Tags ?? []))].sort();
  $("tags").replaceChildren(...all.map(t => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = "#" + t; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { tagsOn.has(t) ? tagsOn.delete(t) : tagsOn.add(t); b.setAttribute("aria-pressed", String(tagsOn.has(t))); render(); });
    return b;
  }));
}

// ---------- the viewer ----------
const dlg = $<HTMLDialogElement>("item");
let stage: Stage | null = null;
let current: LibraryItem | null = null;
async function open(i: LibraryItem) {
  current = i;
  history.replaceState(null, "", `#${i.Kind}-${i.Id}`);
  $("item-kind").textContent = i.Kind === "saver" ? "Screensaver" : "Dash";
  $("item-name").textContent = i.Name;
  $("item-by").textContent = `by ${i.Author} · v${i.Version}${i.License ? " · " + i.License : ""}`;
  $("item-desc").textContent = i.Description ?? "";
  const facts: [string, string][] = [
    ["On the wheel", i.BytesPerSecond ? `${(i.BytesPerSecond / 1000).toFixed(1)} KB/s` : "tiny"],
    ["First draw", i.BytesStatic ? `${(i.BytesStatic / 1000).toFixed(1)} KB` : "-"],
    ["Games", i.Games?.length ? i.Games.join(", ") : "any"],
    ["Needs plugin", i.MinPlugin ? "v" + i.MinPlugin : "any"],
  ];
  $("item-facts").replaceChildren(...facts.map(([k, v]) => { const d = document.createElement("div"); d.innerHTML = "<dt></dt><dd></dd>"; d.querySelector("dt")!.textContent = k; d.querySelector("dd")!.textContent = v; return d; }));
  $("item-tags").replaceChildren(...(i.Tags ?? []).map(t => { const s = document.createElement("span"); s.className = "chip"; s.textContent = "#" + t; return s; }));
  const dl = $<HTMLAnchorElement>("download");
  dl.href = url(i.DashUrl); dl.setAttribute("download", `${i.Id}.json`);
  updateInstall();
  if (!dlg.open) dlg.showModal();
  await showWheel(i);
}

/** The wheel with the item on its screen; if 3D can't start (or the context was lost for good), the item's picture instead. */
async function showWheel(i: LibraryItem) {
  const viewer = $("viewer");
  const still = () => {
    dropStage();
    const img = new Image();
    img.className = "still"; img.alt = i.Name; img.src = url(i.PreviewUrl);
    viewer.replaceChildren(img);
  };
  if (!webglOk()) return still();
  try {
    if (stage?.contextLost()) dropStage(); // a lost context blanks the canvas for good: start again with a fresh one
    if (!stage) { viewer.replaceChildren(); stage = new Stage(viewer, defaultWheel, { shot: "card", intro: false, particles: false }); }
    stage.paused = false;
    const dash = await getDash(i);
    if (current !== i) return; // another item was opened while this one loaded
    stage.setDash(dash);
    stage.setShot("card");
  } catch (e) {
    console.warn("library viewer:", e);
    if (current === i && !stage) still();
    else if (current === i) $("install-note").textContent = "This one didn't load. Close it and try again, or download the file.";
  }
}

function dropStage() { try { stage?.dispose(); } catch { /* already gone */ } stage = null; }

function updateInstall() {
  const btn = $<HTMLButtonElement>("install"), note = $("install-note"), i = current!;
  const inst = plugin.installed?.find(x => x.id === i.Id && x.kind === i.Kind);
  btn.disabled = !plugin.available;
  btn.textContent = inst ? (inst.version === i.Version ? "Installed ✓" : `Update to v${i.Version}`) : "Install in the plugin";
  note.textContent = plugin.available ? "The plugin asks you to confirm, then it's on the wheel: no restart."
    : "Install needs FX Unleashed running in SimHub on this PC (your browser may ask to allow access to local devices). Or download the file and use the plugin's Import.";
}

$("install").addEventListener("click", async () => {
  const i = current!, note = $("install-note");
  note.textContent = "Confirm in the plugin (SimHub)…";
  try {
    const r = await installInPlugin(i);
    note.textContent = r.installed ? `Installed v${r.version}. It's in the plugin now.` : "Not installed: " + (r.error ?? "unknown");
    plugin = await pluginState(); updateInstall(); render();
  } catch { note.textContent = "Couldn't reach the plugin."; }
});
const close = () => { dlg.close(); };
$("close").addEventListener("click", close);
dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
dlg.addEventListener("close", () => { if (stage) stage.paused = true; history.replaceState(null, "", location.pathname); });

// ---------- start ----------
document.querySelectorAll<HTMLButtonElement>("#kind button").forEach(b => b.addEventListener("click", () => {
  kind = b.dataset.kind!;
  document.querySelectorAll("#kind button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
  render();
}));
[q, game, sort].forEach(x => x.addEventListener("input", render));

(async () => {
  const [index, p] = await Promise.all([loadIndex(), pluginState()]);
  plugin = p;
  const st = $("plugin-status");
  st.classList.add(p.available ? "ok" : "no");
  st.querySelector(".txt")!.textContent = p.available ? `FX Unleashed v${p.version} found on this PC: installs go straight to your wheel.` : "The plugin isn't running on this PC: you can still download items.";
  items = index.Items;
  for (const g of [...new Set(items.flatMap(i => i.Games ?? []))].sort()) game.add(new Option(g, g));
  tags();
  render();
  const h = location.hash.slice(1);
  const hit = items.find(i => `${i.Kind}-${i.Id}` === h);
  if (hit) open(hit);
})();
