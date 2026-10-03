// The site's light engine: one frame of every LED of a wheel (from its definition's groups), from the car state,
// a preset, alerts and hand-painted colours. The presets are the plugin's own FX Pro presets (same colours, effects,
// speeds and brightness: Usb/Lights.cs, LightPresets.FxPro), and the effects are ported from its LightEngine, so a
// preset looks here the way it does on the wheel: keep them in step when the plugin's change. The rev bar is the
// exception: on the wheel it follows each car's real data, so here it is the plugin's standard shift lights.
import type { CarState } from "./demo";
import type { Wheel } from "../../data/wheels/index";

export type RGB = [number, number, number];
export interface Led { c: RGB; a: number } // colour 0-1, intensity 0-1

export type Effect =
  | "off" | "solid" | "breathe" | "wave" | "rainbow" | "scanner" | "comet" | "heartbeat" | "fire" | "twinkle"
  | "ripple" | "plasma" | "sparkle" | "levels";

/** How one group of lights looks: an effect, its speed (seconds per cycle), brightness (0-100) and colours. */
export interface Look { effect: Effect; period: number; brightness: number; colors: string[] }

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  /** A colour that stands for the preset. */
  accent: string;
  /** The rev bar's colours, low to high: the plugin's standard shift colours (presets only style the other lights). */
  rev: string[];
  /** The rev bar at the shift point. */
  flash: string;
  buttons: Look;
  encoders: Look;
  sideLeft: Look;
  sideRight: Look;
  /** CSS background for the preset's chip or card. */
  swatch: string;
}

const look = (effect: Effect, period: number, brightness: number, ...colors: string[]): Look => ({ effect, period, brightness, colors });
const OFF = look("off", 4, 100, "#000000");
const RAINBOW_CSS = "linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)";

/** The plugin's RevLighting defaults: every built-in preset keeps them (its Make() says so), only the other groups differ. */
const REV = ["#00FF40", "#FFB000", "#FF0020"], FLASH = "#0040FF";

type PresetData = Omit<Preset, "swatch" | "rev" | "flash">;

// In the plugin's order: the newest and most striking first, then the classics.
const DATA: PresetData[] = [
  {
    id: "neon-tokyo", name: "Neon Tokyo", accent: "#ff2e97",
    blurb: "Rain-soaked Shibuya at 2 a.m.: magenta and cyan plasma melting across the buttons, city lights twinkling in the encoders, neon signs buzzing on the sides.",
    buttons: look("plasma", 7, 100, "#FF2E97", "#00F0FF", "#7B2FFF"), encoders: look("twinkle", 5, 100, "#1A0033", "#00F0FF", "#FF2E97"),
    sideLeft: look("heartbeat", 2.2, 100, "#FF2E97"), sideRight: look("heartbeat", 2.6, 100, "#00F0FF"),
  },
  {
    id: "hyperspace", name: "Hyperspace", accent: "#b0a0ff",
    blurb: "Punch it: white star streaks racing out of every group into a violet warp. A starfield while you wait, and a hyperdrive spool-up every time the engine fires.",
    buttons: look("comet", 0.9, 100, "#FFFFFF", "#3A1CFF"), encoders: look("twinkle", 3, 100, "#0A0030", "#FFFFFF", "#B0A0FF"),
    sideLeft: look("comet", 0.6, 100, "#FFFFFF", "#6040FF"), sideRight: look("comet", 0.6, 100, "#FFFFFF", "#6040FF"),
  },
  {
    id: "le-mans-night", name: "Le Mans Night", accent: "#ffb000",
    blurb: "Three in the morning on the Mulsanne: warm headlight white on the buttons, amber glowing in the encoders, red tail lights breathing at the sides. Parks with its sidelights on.",
    buttons: look("solid", 4, 55, "#FFE3A8"), encoders: look("breathe", 8, 70, "#FF9A1F"),
    sideLeft: look("breathe", 3, 85, "#FF1010"), sideRight: look("breathe", 3, 85, "#FF1010"),
  },
  {
    id: "inferno", name: "Inferno", accent: "#ff6a00",
    blurb: "Every light a live flame: flickering reds and oranges on the buttons, coals glowing in the encoders, the sides beating like an engine. Starting up lights the fuse; switching off leaves embers.",
    buttons: look("fire", 3, 100, "#3A0000", "#FF2000", "#FF8A00", "#FFD060"), encoders: look("fire", 5, 80, "#200000", "#C01000", "#FF6A00"),
    sideLeft: look("heartbeat", 1.4, 100, "#FF2000"), sideRight: look("heartbeat", 1.4, 100, "#FF2000"),
  },
  {
    id: "abyss", name: "Abyss", accent: "#00c8ff",
    blurb: "The deep ocean: slow teal waves rippling out from the middle, bioluminescent sparks drifting through the encoders, a jellyfish pulse at the sides.",
    buttons: look("ripple", 9, 100, "#001A33", "#00C8FF", "#00FFC0"), encoders: look("twinkle", 7, 100, "#001018", "#00FFD0", "#66F0FF"),
    sideLeft: look("breathe", 5, 90, "#00B0FF", "#8040FF"), sideRight: look("breathe", 5, 90, "#00B0FF", "#8040FF"),
  },
  {
    id: "heartbeat", name: "Heartbeat", accent: "#ff0030",
    blurb: "The wheel has a pulse. Resting at 40 beats a minute while you wait, racing at 80 once the engine runs; a defibrillator jolt on start-up and a flatline when you switch off.",
    buttons: look("heartbeat", 0.75, 100, "#FF0030", "#FF4060"), encoders: look("heartbeat", 0.75, 70, "#FF0030"),
    sideLeft: look("heartbeat", 0.75, 100, "#FF0030"), sideRight: look("heartbeat", 0.75, 100, "#FF0030"),
  },
  {
    id: "race-engineer", name: "Race Engineer", accent: "#00ff40",
    blurb: "All business: each encoder shows its setting (ABS, TC, brake bias, DIFF, map) from green to red, flashing when you change it; calm white everywhere else.",
    buttons: look("solid", 4, 30, "#FFFFFF"), encoders: look("levels", 4, 100, "#00FF40", "#FFB000", "#FF0020"),
    sideLeft: look("solid", 4, 20, "#FFFFFF"), sideRight: look("solid", 4, 20, "#FFFFFF"),
  },
  {
    id: "aurora", name: "Aurora", accent: "#00ffa3",
    blurb: "Teal, blue and violet drifting like northern lights; the side lights breathe teal.",
    buttons: look("wave", 9, 100, "#00FFA3", "#00B3FF", "#7B2FFF"), encoders: look("breathe", 6, 100, "#7B2FFF", "#00FFA3"),
    sideLeft: look("breathe", 6, 90, "#00FFA3"), sideRight: look("breathe", 6, 90, "#00FFA3"),
  },
  {
    id: "synthwave", name: "Synthwave", accent: "#9d4edd",
    blurb: "Hot pink, purple and cyan flowing over the buttons, neon side lights.",
    buttons: look("wave", 6, 100, "#FF2E97", "#9D4EDD", "#00F0FF"), encoders: look("breathe", 4, 100, "#FF2E97", "#00F0FF"),
    sideLeft: look("breathe", 3, 100, "#FF2E97"), sideRight: look("breathe", 3, 100, "#00F0FF"),
  },
  {
    id: "ember", name: "Ember", accent: "#ff5a00",
    blurb: "Glowing embers: slow orange and red breathing with the odd spark.",
    buttons: look("sparkle", 5, 100, "#FF3D00", "#FFB000"), encoders: look("breathe", 5, 100, "#FF5A00", "#FF1E00"),
    sideLeft: look("breathe", 7, 80, "#FF1E00"), sideRight: look("breathe", 7, 80, "#FF1E00"),
  },
  {
    id: "ice", name: "Glacier", accent: "#7fdbff",
    blurb: "Cold white and ice blue flowing slowly; calm and easy on the eyes at night.",
    buttons: look("wave", 12, 70, "#FFFFFF", "#7FDBFF", "#0060FF"), encoders: look("breathe", 8, 70, "#7FDBFF"),
    sideLeft: look("solid", 4, 40, "#0060FF"), sideRight: look("solid", 4, 40, "#0060FF"),
  },
  {
    id: "scanner", name: "Scanner", accent: "#ff0010",
    blurb: "A red light sweeping across the buttons, encoders breathing red. Knight Rider across the whole wheel while you wait.",
    buttons: look("scanner", 1.6, 100, "#FF0010"), encoders: look("breathe", 3, 100, "#FF0010"), sideLeft: OFF, sideRight: OFF,
  },
  {
    id: "stealth", name: "Stealth", accent: "#9aa1ab",
    blurb: "Dim white buttons and nothing else, until something needs your attention. Completely dark with the engine off.",
    buttons: look("solid", 4, 18, "#FFFFFF"), encoders: OFF, sideLeft: OFF, sideRight: OFF,
  },
  {
    id: "rainbow", name: "Full Rainbow", accent: "#ffe23a",
    blurb: "Every light a flowing rainbow; the rev lights stay shift lights.",
    buttons: look("rainbow", 5, 100, "#FFFFFF"), encoders: look("rainbow", 5, 100, "#FFFFFF"),
    sideLeft: look("rainbow", 5, 100, "#FFFFFF"), sideRight: look("rainbow", 5, 100, "#FFFFFF"),
  },
];

const swatchOf = (p: PresetData) =>
  p.buttons.effect === "rainbow" ? RAINBOW_CSS
    : p.buttons.colors.length > 1 ? `linear-gradient(90deg,${p.buttons.colors.join(",")})` : p.buttons.colors[0];

export const PRESETS: Preset[] = DATA.map(p => ({ ...p, rev: REV, flash: FLASH, swatch: swatchOf(p) }));

export function hex(h: string): RGB {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

/** Evenly spread from the first colour to the last (no wrap). */
function gradient(stops: string[], t: number): RGB {
  if (stops.length === 1) return hex(stops[0]);
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
  return mix(hex(stops[i]), hex(stops[i + 1]), x - i);
}

/** Colours spread evenly around a loop, position 0-1 (wraps, eased): the plugin's Wave. */
function loop(stops: string[], pos: number): RGB {
  if (stops.length === 1) return hex(stops[0]);
  const p = (((pos % 1) + 1) % 1) * stops.length, a = Math.floor(p) % stops.length, b = (a + 1) % stops.length;
  let t = p - Math.floor(p);
  t = t * t * (3 - 2 * t);
  return mix(hex(stops[a]), hex(stops[b]), t);
}

/** Every hue flowing along a group (the plugin's Rainbow). */
function hue(h: number): RGB {
  h = (((h % 1) + 1) % 1) * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  switch (Math.floor(h)) {
    case 0: return [1, x, 0]; case 1: return [x, 1, 0]; case 2: return [0, 1, x];
    case 3: return [0, x, 1]; case 4: return [x, 0, 1]; default: return [1, 0, x];
  }
}

const breath = (cycle: number) => 0.06 + 0.94 * (0.5 - 0.5 * Math.cos(cycle * 2 * Math.PI));
/** A soft pulse: 0 outside [start, start + width], a sine hump inside. */
const pulse = (t: number, start: number, width: number) => (t < start || t > start + width ? 0 : Math.sin((Math.PI * (t - start)) / width));
/** 0-1, the same for the same input (so effects look random but render the same every time). */
const hash = (x: number) => { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise over time for one light. */
function noise(x: number, t: number) {
  const a = Math.floor(t); let f = t - a;
  f = f * f * (3 - 2 * f);
  const h0 = hash(x * 17.13 + a * 3.71), h1 = hash(x * 17.13 + (a + 1) * 3.71);
  return h0 + (h1 - h0) * f;
}

/** The encoders' settings under the Levels effect: key in the car state and the range the colours span. */
const LEVELS: { key: string; low: number; high: number }[] = [
  { key: "absLevel", low: 1, high: 11 }, { key: "tcLevel", low: 1, high: 11 }, { key: "brakeBias", low: 50, high: 64 },
  { key: "diff", low: 1, high: 10 }, { key: "engineMap", low: 1, high: 10 },
];

// ---------- alerts: the plugin's default rules (LightPresets.DefaultAlerts, LightEngine.AlertLevel) ----------
// The first rule that is on wins a light. Every rule's own clock starts when it comes on, so a flash starts lit.
type AlertStyle = "flash" | "pulse" | "sweep" | "checker";
type AlertGroup = "buttonsLeft" | "buttonsRight" | "sideLeft" | "sideRight" | "rev" | "encoders";
interface AlertRule { id: string; color: string; hz: number; style?: AlertStyle; groups: AlertGroup[]; on: (s: CarState, limiter: boolean) => boolean }

const ALERTS: AlertRule[] = [
  // a car alongside takes the six buttons on its side: red, flashing twice a second, lit first (as ATSR-Hub's does)
  { id: "spotterLeft", color: "#FF0000", hz: 2, groups: ["buttonsLeft"], on: s => s.spotterLeft },
  { id: "spotterRight", color: "#FF0000", hz: 2, groups: ["buttonsRight"], on: s => s.spotterRight },
  // the three small lights beside the rev bar are for warnings
  { id: "abs", color: "#FFB000", hz: 12, groups: ["sideLeft"], on: s => s.absActive },
  { id: "tc", color: "#00A0FF", hz: 12, groups: ["sideRight"], on: s => s.tcActive },
  { id: "pitLimiter", color: "#0040FF", hz: 3, groups: ["rev"], on: (s, limiter) => s.pitLimiter && !limiter },
  { id: "black", color: "#FF0020", hz: 4, groups: ["encoders"], on: s => s.flag === "black" },
  { id: "blue", color: "#0040FF", hz: 2, groups: ["encoders"], on: s => s.flag === "blue" },
  { id: "yellow", color: "#FFD000", hz: 2, groups: ["encoders"], on: s => s.flag === "yellow" },
  { id: "chequered", color: "#FFFFFF", hz: 3, style: "checker", groups: ["encoders", "rev"], on: s => s.flag === "chequered" },
  { id: "white", color: "#FFFFFF", hz: 1, style: "pulse", groups: ["encoders"], on: s => s.flag === "white" },
  // off by default in the plugin; on here because the site offers a green flag to try
  { id: "green", color: "#00FF40", hz: 2, style: "sweep", groups: ["rev"], on: s => s.flag === "green" },
];

/** How lit (0-1) light `i` of an alert's `n` lights is `age` seconds after it came on, by the alert's style. */
function alertLevel(a: AlertRule, i: number, n: number, age: number): number {
  const hz = a.hz;
  switch (a.style) {
    case "pulse": return hz <= 0 ? 1 : breath(age * hz);
    case "sweep": {
      if (n <= 1) return 1;
      // a band a third of the lights wide, crossing them `hz` times a second
      const head = ((age * (hz > 0 ? hz : 0.5)) % 1) * (n + n / 3) - n / 6;
      return Math.max(0, 1 - Math.abs(i - head) / Math.max(1, n / 6));
    }
    case "checker": return (i + (hz <= 0 ? 0 : Math.floor(age * hz * 2) % 2)) % 2 === 0 ? 1 : 0;
    default: return hz <= 0 || Math.floor(age * hz * 2) % 2 === 0 ? 1 : 0;
  }
}

export class LightEngine {
  preset: Preset = PRESETS[0];
  /** Hand-painted colours by LED index (the light lab, "paint" mode); null = the preset's. */
  painted = new Map<number, RGB | null>();
  /** 0..1: how far the start-up sequence has run (LEDs ignite in order). */
  ignite = 1;
  startPct = 58;
  shiftPct = 94;
  brightness = 1;
  alertsOn = true;

  private sparkle: number[] = [];
  /** When each alert that is on came on (frame time), so its flash starts at its beginning. */
  private alertSince = new Map<string, number>();

  constructor(public wheel: Wheel) {}

  /** One light of a group under its look: [colour, level 0-1]. `i` is its place in the group, `n` the group's size, `led` its number. */
  private ambient(l: Look, i: number, n: number, led: number, now: number): Led {
    const cols = l.colors.length ? l.colors : ["#FFFFFF"];
    const period = Math.max(0.2, l.period);
    const pos = n <= 1 ? 0 : i / n;
    const bright = Math.max(0, Math.min(100, l.brightness)) / 100;
    const out = (c: RGB, level: number): Led => ({ c, a: Math.max(0, Math.min(1, level)) * bright });
    switch (l.effect) {
      case "off": return { c: [0, 0, 0], a: 0 };
      case "solid": return out(hex(cols[i % cols.length]), 1);
      case "breathe": {
        const cycle = now / period;
        return out(hex(cols[Math.floor(cycle) % cols.length]), breath(cycle));
      }
      case "wave": return out(loop(cols, pos - now / period), 1);
      case "rainbow": return out(hue(pos * 0.6 + now / period), 1);
      case "scanner": {
        const t = (now / period) % 2, head = (t < 1 ? t : 2 - t) * (n - 1);
        const level = Math.max(0, 1 - Math.abs(i - head) / 2.2);
        return out(hex(cols[0]), 0.04 + 0.96 * level * level);
      }
      case "comet": {
        // the head runs along and round again; the tail fades from the first colour to the last
        const head = ((now / period) % 1) * n, tail = Math.max(2, n * 0.45), back = (((head - i) % n) + n) % n;
        if (back > tail) return { c: [0, 0, 0], a: 0 };
        const k = 1 - back / tail;
        return out(mix(hex(cols[0]), hex(cols[cols.length - 1]), 1 - k), k * k);
      }
      case "heartbeat": {
        const t = (now / period) % 1, beat = Math.max(pulse(t, 0, 0.11), 0.75 * pulse(t, 0.18, 0.13));
        const c = beat > 0 && t >= 0.18 && cols.length > 1 ? hex(cols[1]) : hex(cols[0]);
        return out(c, 0.05 + 0.95 * beat);
      }
      case "fire": {
        const speed = 8 / period;
        const heat = 0.25 + 0.75 * noise(led * 1.7, now * speed) * (0.55 + 0.45 * noise(led * 0.31 + 9, now * speed * 0.37));
        return out(gradient(cols.length > 1 ? cols : ["#300000", cols[0]], heat), 0.2 + 0.8 * heat);
      }
      case "twinkle": {
        const star = cols.length > 1 ? cols[1 + (Math.floor(hash(led * 3.3) * (cols.length - 1)) % (cols.length - 1))] : "#FFFFFF";
        const rate = 0.6 + hash(led * 7.1) * 0.9, c = (now / period) * rate + hash(led * 5.7 + 1), f = c - Math.floor(c);
        const k = hash(led * 13.7 + Math.floor(c) * 3.1) > 0.45 ? Math.pow(Math.sin(Math.PI * f), 3) : 0;
        // the base glows softly (a night sky, not off), stars flare over it
        return out(mix(hex(cols[0]), hex(star), k), 0.3 + 0.7 * k);
      }
      case "ripple": {
        const d = n <= 1 ? 0 : Math.abs(i / (n - 1) - 0.5) * 2, wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * (d * 1.2 - now / period));
        return out(loop(cols, d * 0.5 - (now / period) * 0.25), 0.12 + 0.88 * wave * wave);
      }
      case "plasma": {
        const w = (2 * Math.PI * now) / period;
        const x = Math.sin(i * 0.9 + w) + Math.sin(i * 0.37 - w * 1.7 + 1.3) + Math.sin((i + (now * 3) / period) * 0.21);
        return out(gradient(cols, (x / 3 + 1) / 2), 1);
      }
      case "sparkle": {
        if ((this.sparkle[led] ?? 0) < now && Math.random() < 0.012) this.sparkle[led] = now + 0.35;
        const glint = Math.max(0, ((this.sparkle[led] ?? 0) - now) / 0.35);
        const c = mix(hex(cols[0]), hex(cols[Math.min(1, cols.length - 1)]), glint);
        return out(c, Math.min(1, 0.25 + 0.2 * breath(now / period + pos) + glint));
      }
      case "levels": return out(hex(cols[0]), 0.08); // the encoders are drawn by frame() (they need the car's settings)
    }
    return { c: [0, 0, 0], a: 0 };
  }

  /** The lights of an alert group: the six buttons on a side are the left / right buttons (by name, else the two halves). */
  private alertLeds(g: AlertGroup): number[] {
    const w = this.wheel, groups = w.groups;
    if (g === "buttonsLeft" || g === "buttonsRight") {
      const b = groups.buttons?.leds ?? [], side = g === "buttonsLeft" ? /^left/i : /^right/i;
      const named = b.filter(i => side.test(w.leds.find(l => l.i === i)?.name ?? ""));
      if (named.length) return named;
      return g === "buttonsLeft" ? b.slice(0, Math.floor(b.length / 2)) : b.slice(Math.floor(b.length / 2));
    }
    return groups[g]?.leds ?? [];
  }

  /** Alerts over the frame: the first rule that is on takes a light. */
  private paintAlerts(s: CarState, t: number, set: (i: number, c: RGB, a?: number) => void) {
    const taken = new Set<number>();
    for (const a of ALERTS) {
      if (!a.on(s, !!s.limiter)) { this.alertSince.delete(a.id); continue; }
      let since = this.alertSince.get(a.id);
      if (since === undefined || since > t) this.alertSince.set(a.id, since = t);
      const c = hex(a.color), leds = [...new Set(a.groups.flatMap(g => this.alertLeds(g)))];
      leds.forEach((led, i) => {
        if (taken.has(led)) return;
        taken.add(led);
        set(led, c, alertLevel(a, i, leds.length, t - since!));
      });
    }
  }

  frame(s: CarState, t: number): Led[] {
    const w = this.wheel, p = this.preset;
    const out: Led[] = w.leds.map(() => ({ c: [0, 0, 0] as RGB, a: 0 }));
    const set = (i: number, c: RGB, a = 1) => { if (out[i]) { out[i].c = c; out[i].a = a; } };
    const g = (name: string) => w.groups[name]?.leds ?? [];

    // rev bar: the preset's own pattern (left to right from 75% of the shift point, low/mid/high colours),
    // blinking the flash colour at 8 Hz from the shift point
    const rev = g("rev");
    const flashOn = Math.floor(t * 16) % 2 === 0;
    rev.forEach((led, k) => {
      const rank = k / Math.max(1, rev.length - 1);
      if (s.shift || s.limiter) return set(led, hex(p.flash), flashOn ? 1 : 0);
      const at = (0.75 + 0.25 * rank) * this.shiftPct;
      set(led, hex(p.rev[Math.min(p.rev.length - 1, Math.floor(rank * p.rev.length))]), s.rpmPercent >= at ? 1 : 0);
    });

    // buttons, encoders and side lights: the preset's effect for each group
    const group = (leds: number[], l: Look) => leds.forEach((led, k) => { const x = this.ambient(l, k, leds.length, led, t); set(led, x.c, x.a); });
    group(g("buttons"), p.buttons);
    group(g("sideLeft"), p.sideLeft);
    group(g("sideRight"), p.sideRight);
    const enc = g("encoders");
    if (p.encoders.effect === "levels") {
      // each encoder is a gauge of its setting: first colour = low, last = high
      const bright = p.encoders.brightness / 100, cols = p.encoders.colors;
      enc.forEach((led, k) => {
        const lv = LEVELS[k]; const v = lv ? (s as unknown as Record<string, unknown>)[lv.key] : undefined;
        const x = typeof v === "number" ? v : lv && lv.key === "diff" ? 5 : undefined;
        if (!lv || x === undefined || (x <= 0 && lv.key !== "brakeBias")) return set(led, hex(cols[0]), 0.08 * bright);
        set(led, gradient(cols, (x - lv.low) / (lv.high - lv.low)), bright);
      });
    } else group(enc, p.encoders);

    if (this.alertsOn) this.paintAlerts(s, t, set);

    // hand-painted colours win
    for (const [i, c] of this.painted) if (c) set(i, c, 1);

    // start-up: LEDs ignite in order (rev bar first, then the rest)
    if (this.ignite < 1) {
      const order = [...rev, ...g("sideLeft"), ...g("sideRight"), ...enc, ...g("buttons")];
      order.forEach((led, k) => { const at = k / order.length; if (this.ignite < at) out[led].a = 0; });
    }
    for (const o of out) o.a *= this.brightness;
    return out;
  }
}
