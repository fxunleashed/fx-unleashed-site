// The light lab: every control of the light engine on one page, around the 3D wheel.
import { Stage, webglOk } from "./engine/stage";
import { defaultWheel as wheel } from "../data/wheels/index";
import { PRESETS, hex, type RGB } from "./engine/lights";
import { loadIndex, url } from "./library";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
if (webglOk()) {
  const stage = new Stage($("stage"), wheel, { shot: "lab", intro: true });
  (window as any).stage = stage;
  const L = stage.lights, car = stage.car;
  let color: RGB = hex("#ff1f2d");
  const forced: Record<string, boolean> = {};
  let rpmOverride = -1;

  // presets
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(b => b.addEventListener("click", () => {
    L.preset = PRESETS.find(p => p.id === b.dataset.preset)!;
    document.querySelectorAll("[data-preset]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));

  // paint
  const picker = $<HTMLInputElement>("color");
  picker.addEventListener("input", () => (color = hex(picker.value)));
  document.querySelectorAll<HTMLButtonElement>(".sw").forEach(b => b.addEventListener("click", () => { picker.value = b.dataset.c!; color = hex(b.dataset.c!); }));
  stage.onLedClick = (i, e) => L.painted.set(i, e.shiftKey ? null : ([...color] as RGB));
  document.querySelectorAll<HTMLButtonElement>("[data-fill]").forEach(b => b.addEventListener("click", () => {
    const ids = b.dataset.fill === "all" ? wheel.leds.map(l => l.i) : wheel.groups[b.dataset.fill!].leds;
    for (const i of ids) L.painted.set(i, [...color] as RGB);
  }));
  $("rainbow").addEventListener("click", () => {
    wheel.leds.forEach((l, k) => {
      const h = (k / wheel.leds.length) * 6, f = (n: number) => { const x = (n + h) % 6; return Math.max(0, Math.min(1, Math.min(x, 4 - x))); };
      L.painted.set(l.i, [f(5), f(3), f(1)]);
    });
  });
  $("clear").addEventListener("click", () => L.painted.clear());
  $<HTMLInputElement>("bright").addEventListener("input", e => (L.brightness = +(e.target as HTMLInputElement).value / 100));

  // rev
  const rpm = $<HTMLInputElement>("rpm");
  rpm.addEventListener("input", () => { rpmOverride = +rpm.value; $("rpm-out").textContent = rpmOverride ? rpmOverride + "%" : "auto"; if (!rpmOverride) rpmOverride = -1; });
  $<HTMLInputElement>("start").addEventListener("input", e => { L.startPct = +(e.target as HTMLInputElement).value; $("start-out").textContent = L.startPct + "%"; });
  $<HTMLInputElement>("shift").addEventListener("input", e => { L.shiftPct = +(e.target as HTMLInputElement).value; $("shift-out").textContent = L.shiftPct + "%"; });

  // alerts
  document.querySelectorAll<HTMLButtonElement>("[data-flag]").forEach(b => b.addEventListener("click", () => car.showFlag(b.dataset.flag as any, 6)));
  document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach(b => b.addEventListener("click", () => {
    forced[b.dataset.toggle!] = !forced[b.dataset.toggle!]; b.setAttribute("aria-pressed", String(forced[b.dataset.toggle!]));
  }));
  stage.onStep = () => {
    for (const [k, v] of Object.entries(forced)) if (v) (car.s as any)[k] = true;
    if (rpmOverride >= 0) {
      car.s.rpmPercent = rpmOverride; car.s.rpm = (rpmOverride / 100) * car.s.maxRpm;
      car.s.shift = rpmOverride >= L.shiftPct; car.s.limiter = rpmOverride >= 99;
    }
  };

  // screen
  const screens = $("screens");
  screens.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest("button"); if (!b) return;
    screens.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    if (b.dataset.screen === "saver") { stage.screenMode = "saver"; stage.replayIntro(); stage.lights.ignite = 1; stage.model.setBuild(1); }
    else if (b.dataset.screen === "off") stage.screenMode = "off";
  });
  loadIndex().then(index => {
    for (const item of index.Items) {
      const b = document.createElement("button"); b.className = "chip"; b.textContent = item.Name;
      b.addEventListener("click", async () => stage.setDash(await (await fetch(url(item.DashUrl))).json()));
      screens.insertBefore(b, screens.firstChild);
      if (item.Id === "stint") fetch(url(item.DashUrl)).then(r => r.json()).then(d => stage.setDash(d));
    }
  });

  // view
  document.querySelectorAll<HTMLButtonElement>("[data-shot]").forEach(b => b.addEventListener("click", () => stage.setShot(b.dataset.shot!)));
  const spin = $("spin");
  spin.addEventListener("click", () => { stage.autoSpin = stage.autoSpin ? 0 : 0.35; spin.setAttribute("aria-pressed", String(!!stage.autoSpin)); });
  $("shot").addEventListener("click", () => {
    stage.composer.render();
    const a = document.createElement("a");
    a.href = stage.renderer.domElement.toDataURL("image/png"); a.download = "fx-unleashed-lights.png"; a.click();
  });
  $("export").addEventListener("click", async () => {
    const out: Record<string, string> = {};
    for (const [i, c] of L.painted) if (c) out[i] = "#" + c.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    const text = JSON.stringify({ wheel: wheel.id, preset: L.preset.id, painted: out }, null, 1);
    try { await navigator.clipboard.writeText(text); $("export-note").textContent = "Copied: LED number -> colour, in the plugin's LED order."; }
    catch { $("export-note").textContent = text; }
  });

  // tools panel
  $("collapse").addEventListener("click", () => { $("tools").hidden = true; $("reopen").hidden = false; });
  $("reopen").addEventListener("click", () => { $("tools").hidden = false; $("reopen").hidden = true; });

  // which LED is this?
  const tip = $("tip");
  addEventListener("pointermove", e => {
    const i = stage.hoverLed;
    if (i < 0) { tip.hidden = true; return; }
    const led = wheel.leds[i];
    tip.hidden = false;
    tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px";
    tip.innerHTML = `<b>LED ${led.i}</b>`;
    tip.append(led.name);
  }, { passive: true });
}
