// The site's light engine: one frame of every LED of a wheel (from its definition's groups), from the car state,
// a preset, alerts and hand-painted colours. The presets and their effects are the plugin's own (LightPresets and
// LightEngine.Ambient / RenderRpm in the plugin's Usb/Lights.cs): keep them in step when the plugin's change.
import type { CarState } from "./demo";
import type { Wheel } from "../../data/wheels/index";

export type RGB = [number, number, number];
export interface Led { c: RGB; a: number } // colour 0-1, intensity 0-1

export type Effect = "off" | "solid" | "breathe" | "wave" | "rainbow" | "rainbowBreathe" | "scanner" | "sparkle";
export interface GroupLight { effect: Effect; period: number; brightness: number; colors: string[] }
export type AmbientGroup = "buttons" | "encoders" | "sideLeft" | "sideRight";

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  rev: string[];            // low, mid, high (the plugin's RevLighting.Colors)
  flash: string;            // at the shift point
  groups: Record<AmbientGroup, GroupLight>;
  /** CSS background for the preset's card. */
  swatch: string;
}

const RAINBOW_CSS = "linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)";
const DEFAULT_REV = ["#00FF40", "#FFB000", "#FF0020"], DEFAULT_FLASH = "#0040FF";
type G = [Effect, number, number, string[]];
function make(id: string, name: string, blurb: string, buttons: G, encoders: G, sideLeft: G, sideRight: G, rev?: [string, string, string, string]): Preset {
  const gl = ([effect, period, brightness, colors]: G): GroupLight => ({ effect, period, brightness, colors });
  const swatch = buttons[0] === "rainbow" || buttons[0] === "rainbowBreathe" ? RAINBOW_CSS
    : buttons[3].length > 1 ? `linear-gradient(90deg,${buttons[3].join(",")})` : buttons[3][0];
  return {
    id, name, blurb, rev: rev ? rev.slice(0, 3) : DEFAULT_REV, flash: rev ? rev[3] : DEFAULT_FLASH,
    groups: { buttons: gl(buttons), encoders: gl(encoders), sideLeft: gl(sideLeft), sideRight: gl(sideRight) }, swatch,
  };
}

export const PRESETS: Preset[] = [
  make("mustang", "Prism", "A rainbow drifting over the buttons and encoders, breathing slowly.",
    ["rainbowBreathe", 4, 100, ["#FFFFFF"]], ["rainbowBreathe", 4, 100, ["#FFFFFF"]], ["rainbowBreathe", 4, 100, ["#FFFFFF"]], ["rainbowBreathe", 4, 100, ["#FFFFFF"]]),
  make("aurora", "Aurora", "Teal, blue and violet drifting like northern lights; the side lights breathe teal.",
    ["wave", 9, 100, ["#00FFA3", "#00B3FF", "#7B2FFF"]], ["breathe", 6, 100, ["#7B2FFF", "#00FFA3"]], ["breathe", 6, 90, ["#00FFA3"]], ["breathe", 6, 90, ["#00FFA3"]],
    ["#00FFA3", "#00B3FF", "#7B2FFF", "#FFFFFF"]),
  make("synthwave", "Synthwave", "Hot pink, purple and cyan flowing over the buttons, neon side lights.",
    ["wave", 6, 100, ["#FF2E97", "#9D4EDD", "#00F0FF"]], ["breathe", 4, 100, ["#FF2E97", "#00F0FF"]], ["breathe", 3, 100, ["#FF2E97"]], ["breathe", 3, 100, ["#00F0FF"]],
    ["#00F0FF", "#9D4EDD", "#FF2E97", "#FFFFFF"]),
  make("ember", "Ember", "Glowing embers: slow orange and red breathing with the odd spark.",
    ["sparkle", 5, 100, ["#FF3D00", "#FFB000"]], ["breathe", 5, 100, ["#FF5A00", "#FF1E00"]], ["breathe", 7, 80, ["#FF1E00"]], ["breathe", 7, 80, ["#FF1E00"]],
    ["#FFD000", "#FF7A00", "#FF1E00", "#FFFFFF"]),
  make("ice", "Glacier", "Cold white and ice blue flowing slowly; calm and easy on the eyes at night.",
    ["wave", 12, 70, ["#FFFFFF", "#7FDBFF", "#0060FF"]], ["breathe", 8, 70, ["#7FDBFF"]], ["solid", 4, 40, ["#0060FF"]], ["solid", 4, 40, ["#0060FF"]],
    ["#FFFFFF", "#7FDBFF", "#0060FF", "#FF0020"]),
  make("scanner", "Scanner", "A red light sweeping across the buttons, encoders breathing red.",
    ["scanner", 1.6, 100, ["#FF0010"]], ["breathe", 3, 100, ["#FF0010"]], ["off", 4, 100, ["#000000"]], ["off", 4, 100, ["#000000"]],
    ["#FF0010", "#FF0010", "#FF0010", "#FFFFFF"]),
  make("stealth", "Stealth", "Dim white buttons and nothing else, until something needs your attention.",
    ["solid", 4, 18, ["#FFFFFF"]], ["off", 4, 100, ["#000000"]], ["off", 4, 100, ["#000000"]], ["off", 4, 100, ["#000000"]]),
  make("rainbow", "Full Rainbow", "Every light a flowing rainbow; the rev lights stay shift lights.",
    ["rainbow", 5, 100, ["#FFFFFF"]], ["rainbow", 5, 100, ["#FFFFFF"]], ["rainbow", 5, 100, ["#FFFFFF"]], ["rainbow", 5, 100, ["#FFFFFF"]]),
];

export function hex(h: string): RGB {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function gradient(stops: string[], t: number): RGB {
  if (stops.length === 1) return hex(stops[0]);
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
  return mix(hex(stops[i]), hex(stops[i + 1]), x - i);
}

const breath = (cycle: number) => 0.06 + 0.94 * (0.5 - 0.5 * Math.cos(cycle * 2 * Math.PI));

/** Colours flowing round in a loop, eased between neighbours (the plugin's Gradient). */
function loopGradient(colors: string[], pos: number): RGB {
  if (colors.length === 1) return hex(colors[0]);
  pos = ((pos % 1) + 1) % 1 * colors.length;
  const a = Math.floor(pos) % colors.length, b = (a + 1) % colors.length;
  let t = pos - Math.floor(pos); t = t * t * (3 - 2 * t);
  return mix(hex(colors[a]), hex(colors[b]), t);
}

function hue(h: number): RGB {
  h = ((h % 1) + 1) % 1 * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  return ([[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]] as RGB[])[Math.min(5, Math.floor(h))];
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

  constructor(public wheel: Wheel) {}

  /** One LED of a group: [colour, intensity]. The plugin's LightEngine.Ambient. */
  private ambient(l: GroupLight, i: number, n: number, led: number, now: number): [RGB, number] {
    const colors = l.colors.length ? l.colors : ["#FFFFFF"];
    const period = Math.max(0.2, l.period), pos = n <= 1 ? 0 : i / n, b = Math.max(0, Math.min(100, l.brightness)) / 100;
    switch (l.effect) {
      case "off": return [[0, 0, 0], 0];
      case "solid": return [hex(colors[i % colors.length]), b];
      case "breathe": { const cycle = now / period; return [hex(colors[Math.floor(cycle) % colors.length]), breath(cycle) * b]; }
      case "wave": return [loopGradient(colors, pos - now / period), b];
      case "rainbow": return [hue(pos * 0.6 + now / period), b];
      case "rainbowBreathe": return [hue(pos + now / (period * 3)), breath(now / period) * b];
      case "scanner": {
        const t = (now / period) % 2, head = (t < 1 ? t : 2 - t) * (n - 1);
        const level = Math.max(0, 1 - Math.abs(i - head) / 2.2);
        return [hex(colors[0]), (0.04 + 0.96 * level * level) * b];
      }
      case "sparkle": {
        if ((this.sparkle[led] ?? 0) < now && Math.random() < 0.012) this.sparkle[led] = now + 0.35;
        const glint = Math.max(0, ((this.sparkle[led] ?? 0) - now) / 0.35);
        const c = mix(hex(colors[0]), hex(colors[Math.min(1, colors.length - 1)]), glint);
        return [c, Math.min(1, 0.25 + 0.2 * breath(now / period + pos) + glint) * b];
      }
    }
    return [[0, 0, 0], 0];
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
    if (s.pitLimiter) rev.forEach((led, k) => set(led, hex("#4da3ff"), (k + Math.floor(t * 4)) % 2 === 0 ? 1 : 0.05));

    // buttons, encoders and side lights: the preset's effect per group
    for (const name of ["buttons", "encoders", "sideLeft", "sideRight"] as AmbientGroup[]) {
      const leds = g(name), l = p.groups[name];
      leds.forEach((led, i) => { const [c, a] = this.ambient(l, i, leds.length, led, t); set(led, c, a); });
    }
    if (s.spotterLeft) g("sideLeft").forEach(led => set(led, hex("#ffb000"), 1));
    if (s.spotterRight) g("sideRight").forEach(led => set(led, hex("#ffb000"), 1));

    // ABS / TC: their encoder lights flash while working
    const enc = g("encoders");
    const alertOn = Math.floor(t * 9) % 2 === 0;
    if (this.alertsOn && s.absActive && enc[0] !== undefined) set(enc[0], hex("#ff9a1f"), alertOn ? 1 : 0.1);
    if (this.alertsOn && s.tcActive && enc[1] !== undefined) set(enc[1], hex("#4da3ff"), alertOn ? 1 : 0.1);

    // flags: side lights and buttons take the flag
    if (this.alertsOn && s.flag) {
      const side = [...g("sideLeft"), ...g("sideRight")], caps = g("buttons");
      const blink = Math.floor(t * 3) % 2 === 0;
      const col = { yellow: "#ffd400", blue: "#2f6bff", green: "#21e07a", white: "#ffffff", black: "#ffffff", chequered: "#ffffff" }[s.flag];
      if (s.flag === "chequered") {
        [...side, ...caps].forEach((led, k) => set(led, hex("#ffffff"), (k + Math.floor(t * 6)) % 2 === 0 ? 1 : 0.02));
        rev.forEach((led, k) => set(led, hex("#ffffff"), (k + Math.floor(t * 6)) % 2 === 0 ? 1 : 0.02));
      } else if (s.flag === "green") {
        const head = (t * 1.6) % 1;
        rev.forEach((led, k) => set(led, hex(col!), Math.abs(k / (rev.length - 1) - head) < 0.18 ? 1 : 0.08));
        side.forEach(led => set(led, hex(col!), 1));
      } else {
        side.forEach(led => set(led, hex(col!), blink ? 1 : 0.1));
        if (s.flag === "yellow" || s.flag === "black") caps.forEach(led => set(led, hex(col!), blink ? 0.9 : 0.1));
        if (s.flag === "blue") caps.forEach(led => set(led, hex(col!), 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 8))));
      }
    }

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
