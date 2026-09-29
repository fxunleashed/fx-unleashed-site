// The site's light engine: one frame of every LED of a wheel (from its definition's groups), from the car state,
// a preset, alerts and hand-painted colours. Close in spirit to the plugin's LightEngine; the presets here are the
// site's own showcase set.
import type { CarState } from "./demo";
import type { Wheel } from "../../data/wheels/index";

export type RGB = [number, number, number];
export interface Led { c: RGB; a: number } // colour 0-1, intensity 0-1

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  rev: string[];            // gradient left to right
  flash: string;            // at the shift point
  buttons: "static" | "flow" | "breathe" | "off";
  buttonColor: string;
  encoders: string;
  side: string;
}

export const PRESETS: Preset[] = [
  { id: "prism", name: "Prism", blurb: "Green to red, white buttons", rev: ["#21e07a", "#21e07a", "#ffe23a", "#ff9a1f", "#ff1f2d"], flash: "#4da3ff", buttons: "static", buttonColor: "#f2f4f8", encoders: "#4da3ff", side: "#ff1f2d" },
  { id: "synthwave", name: "Synthwave", blurb: "Neon pink and violet, flowing buttons", rev: ["#00e5ff", "#7a5cff", "#ff2bd6", "#ff2bd6"], flash: "#ffffff", buttons: "flow", buttonColor: "#ff2bd6", encoders: "#7a5cff", side: "#ff2bd6" },
  { id: "ember", name: "Ember", blurb: "Warm amber, breathing caps", rev: ["#6b1900", "#ff5a00", "#ffb000", "#ffe9b0"], flash: "#ff1f2d", buttons: "breathe", buttonColor: "#ff6a00", encoders: "#ff9a1f", side: "#ff6a00" },
  { id: "aurora", name: "Aurora", blurb: "Teal to violet, northern lights", rev: ["#1effa5", "#22d3ee", "#4f7bff", "#a855f7"], flash: "#ffffff", buttons: "flow", buttonColor: "#22d3ee", encoders: "#1effa5", side: "#a855f7" },
  { id: "ice", name: "Ice", blurb: "Cold white and blue, low glare", rev: ["#74d1ff", "#cdf1ff", "#ffffff"], flash: "#4da3ff", buttons: "static", buttonColor: "#9edcff", encoders: "#cdf1ff", side: "#74d1ff" },
  { id: "stealth", name: "Stealth", blurb: "Dim white, for night stints", rev: ["#6b6f78", "#9aa1ab", "#ffffff"], flash: "#ff1f2d", buttons: "off", buttonColor: "#30343c", encoders: "#30343c", side: "#9aa1ab" },
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

function hsv(h: number, s = 1, v = 1): RGB {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
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

  constructor(public wheel: Wheel) {}

  frame(s: CarState, t: number): Led[] {
    const w = this.wheel, p = this.preset;
    const out: Led[] = w.leds.map(() => ({ c: [0, 0, 0] as RGB, a: 0 }));
    const set = (i: number, c: RGB, a = 1) => { if (out[i]) { out[i].c = c; out[i].a = a; } };
    const g = (name: string) => w.groups[name]?.leds ?? [];

    // rev bar: fill by rpm, flash at the shift point, the limiter strobes
    const rev = g("rev");
    const flashOn = Math.floor(t * 9) % 2 === 0;
    const frac = (s.rpmPercent - this.startPct) / (this.shiftPct - this.startPct);
    rev.forEach((led, k) => {
      const at = k / Math.max(1, rev.length - 1);
      if (s.shift || s.limiter) set(led, hex(p.flash), flashOn ? 1 : 0.05);
      else if (frac * rev.length > k) set(led, gradient(p.rev, at), 1);
      else set(led, gradient(p.rev, at), 0.06);
    });
    if (s.pitLimiter) rev.forEach((led, k) => set(led, hex("#4da3ff"), (k + Math.floor(t * 4)) % 2 === 0 ? 1 : 0.05));

    // side lights: the preset's colour, dim; spotter
    for (const led of g("sideLeft")) set(led, hex(p.side), 0.25);
    for (const led of g("sideRight")) set(led, hex(p.side), 0.25);
    if (s.spotterLeft) g("sideLeft").forEach(led => set(led, hex("#ffb000"), 1));
    if (s.spotterRight) g("sideRight").forEach(led => set(led, hex("#ffb000"), 1));

    // buttons
    g("buttons").forEach((led, k) => {
      if (p.buttons === "off") return set(led, hex(p.buttonColor), 0.15);
      if (p.buttons === "flow") return set(led, hsv((t * 0.12 + k / 12) % 1, 0.85, 1), 0.9);
      if (p.buttons === "breathe") return set(led, hex(p.buttonColor), 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + k * 0.4)));
      set(led, hex(p.buttonColor), 0.6);
    });

    // encoders: their setting as brightness; ABS / TC rings flash while working
    const enc = g("encoders");
    const levels = [s.absLevel / 11, s.tcLevel / 11, (s.brakeBias - 50) / 14, 0.5, s.engineMap / 10];
    enc.forEach((led, k) => set(led, hex(p.encoders), 0.25 + 0.75 * Math.max(0, Math.min(1, levels[k] ?? 0.5))));
    if (this.alertsOn && s.absActive && enc[0] !== undefined) set(enc[0], hex("#ff9a1f"), flashOn ? 1 : 0.1);
    if (this.alertsOn && s.tcActive && enc[1] !== undefined) set(enc[1], hex("#4da3ff"), flashOn ? 1 : 0.1);

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
