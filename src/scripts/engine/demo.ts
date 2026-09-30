// A small car simulation that feeds the whole site: the 3D wheel's lights and screen, the library previews and the
// light lab. Two ways to drive it: `auto` (a demo lap on an imaginary circuit) or `manual` (the visitor's throttle,
// brake and paddles). Values use the plugin's dash binding names, so the site renders the real dash JSON format.

export interface CarState {
  speed: number;        // km/h
  rpm: number;
  maxRpm: number;
  rpmPercent: number;   // 0-100
  gear: number;         // -1 R, 0 N, 1..
  gearText: string;
  throttle: number;     // 0-100
  brake: number;        // 0-100
  currentLapTime: number; // s
  lastLapTime: number;
  bestLapTime: number;
  predictedLap: number;
  delta: number;        // s, + = slower
  position: number;
  lap: number;
  fuel: number;         // l
  fuelPercent: number;
  fuelRemainingLaps: number;
  brakeBias: number;
  tcLevel: number;
  absLevel: number;
  engineMap: number;
  waterTemp: number;
  oilTemp: number;
  absActive: boolean;
  tcActive: boolean;
  pitLimiter: boolean;
  shift: boolean;        // at the shift point
  limiter: boolean;      // on the rev limiter
  flag: "" | "yellow" | "blue" | "green" | "white" | "chequered" | "black";
  spotterLeft: boolean;
  spotterRight: boolean;
  clock: string;
  date: string;
  sessionTypeName: string;
  [key: string]: number | string | boolean;
}

// The imaginary circuit: target speed (km/h) along the lap (0..1), smooth between points.
const TRACK: [number, number][] = [
  [0, 250], [0.1, 282], [0.16, 105], [0.22, 168], [0.3, 236], [0.36, 92], [0.42, 150], [0.52, 262],
  [0.6, 274], [0.66, 128], [0.72, 196], [0.8, 244], [0.86, 72], [0.92, 170], [1, 250],
];
const LAP_KM = 4.3;
const RATIOS = [0, 3.1, 2.25, 1.78, 1.45, 1.22, 1.05]; // speed -> rpm scale per gear
const MAX_RPM = 8600, SHIFT_RPM = 8100, IDLE = 1200;

function target(pos: number) {
  for (let i = 1; i < TRACK.length; i++) {
    const [p1, v1] = TRACK[i];
    if (pos <= p1) {
      const [p0, v0] = TRACK[i - 1];
      const t = (pos - p0) / (p1 - p0);
      return v0 + (v1 - v0) * (0.5 - Math.cos(Math.PI * t) / 2);
    }
  }
  return TRACK[0][1];
}

export class Car {
  mode: "auto" | "manual" = "auto";
  input = { throttle: 0, brake: 0 };
  s: CarState;
  private pos = 0.02;       // lap position 0..1
  private shiftCooldown = 0;
  private bestAt: number[] = [];
  private flagUntil = 0;
  private biasChangedAt = -10;
  time = 0;

  constructor() {
    this.s = {
      speed: 0, rpm: IDLE, maxRpm: MAX_RPM, rpmPercent: 0, gear: 1, gearText: "1", throttle: 0, brake: 0,
      currentLapTime: 0, lastLapTime: 0, bestLapTime: 0, predictedLap: 0, delta: 0, position: 6, lap: 1,
      fuel: 62, fuelPercent: 70, fuelRemainingLaps: 17, brakeBias: 56.2, tcLevel: 6, absLevel: 4, engineMap: 2,
      waterTemp: 84, oilTemp: 98, absActive: false, tcActive: false, pitLimiter: false, shift: false, limiter: false,
      flag: "", spotterLeft: false, spotterRight: false, clock: "", date: "", sessionTypeName: "RACE",
    };
    // The page opens mid-lap, already at speed in a fitting gear: not on a standing start, whose launch set off the
    // traction control flash on every load.
    const s = this.s;
    s.speed = target(this.pos);
    while (s.gear < RATIOS.length - 1 && IDLE + s.speed * RATIOS[s.gear] * 18.5 > SHIFT_RPM - 400) s.gear++;
    s.gearText = String(s.gear);
    s.rpm = IDLE + s.speed * RATIOS[s.gear] * 18.5;
    s.rpmPercent = (s.rpm / MAX_RPM) * 100;
    s.throttle = 100;
  }

  /** When brake bias last changed (the pop-up in dashes like Stint). */
  get biasAge() { return this.time - this.biasChangedAt; }

  setBias(v: number) { this.s.brakeBias = Math.round(v * 10) / 10; this.biasChangedAt = this.time; }
  showFlag(f: CarState["flag"], seconds = 4) { this.s.flag = f; this.flagUntil = this.time + seconds; }

  shiftUp() { if (this.s.gear < RATIOS.length - 1) { this.s.gear++; this.shiftCooldown = 0.12; } }
  shiftDown() { if (this.s.gear > 1) { this.s.gear--; this.shiftCooldown = 0.12; } }

  step(dt: number) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const s = this.s;
    const now = new Date();
    s.clock = now.toTimeString().slice(0, 5);
    s.date = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    let accel: number;
    if (this.mode === "auto") {
      const want = target(this.pos), ahead = target((this.pos + 0.02) % 1);
      const goal = Math.min(want, ahead + 40);
      if (s.speed < goal - 3) { s.throttle = Math.min(100, s.throttle + dt * 400); s.brake = Math.max(0, s.brake - dt * 600); }
      else if (s.speed > goal + 6) { s.brake = Math.min(100, s.brake + dt * 500); s.throttle = 0; }
      else { s.throttle = 45; s.brake = 0; }
    } else {
      s.throttle += (this.input.throttle * 100 - s.throttle) * Math.min(1, dt * 14);
      s.brake += (this.input.brake * 100 - s.brake) * Math.min(1, dt * 14);
    }
    const power = s.gear > 0 ? (s.throttle / 100) * (38 - s.speed * 0.08) * Math.max(0.35, 1.25 - s.gear * 0.12) : 0;
    accel = power - s.brake * 0.55 - 0.9 - s.speed * s.speed * 0.00018;
    if (this.shiftCooldown > 0) { this.shiftCooldown -= dt; accel = Math.min(accel, 0); }
    s.speed = Math.max(0, s.speed + accel * dt * 3.6);

    // rpm from speed and gear; automatic shifts in the demo lap (and in manual mode unless the paddles are used)
    const ratio = RATIOS[Math.max(1, s.gear)];
    let rpm = IDLE + s.speed * ratio * 18.5;
    if (this.mode === "auto") {
      if (rpm > SHIFT_RPM + 150 && s.gear < RATIOS.length - 1) this.shiftUp();
      else if (rpm < 4200 && s.gear > 1 && s.brake > 5) this.shiftDown();
    }
    s.limiter = rpm >= MAX_RPM - 40;
    if (rpm > MAX_RPM) { rpm = MAX_RPM - Math.random() * 180; s.speed = Math.min(s.speed, (MAX_RPM - IDLE) / (ratio * 18.5)); }
    s.rpm += (rpm - s.rpm) * Math.min(1, dt * 20);
    s.rpmPercent = Math.max(0, Math.min(100, (s.rpm / MAX_RPM) * 100));
    s.shift = s.rpm >= SHIFT_RPM;
    s.gearText = s.gear < 0 ? "R" : s.gear === 0 ? "N" : String(s.gear);
    s.absActive = s.brake > 80 && s.speed > 60 && Math.sin(this.time * 31) > 0.2;
    s.tcActive = s.throttle > 90 && s.gear <= 2 && s.speed > 20 && Math.sin(this.time * 27) > 0.4;

    // lap
    this.pos += (s.speed / 3600) * dt / LAP_KM;
    s.currentLapTime += dt;
    const k = Math.floor(this.pos * 20);
    if (this.bestAt[k] === undefined) this.bestAt[k] = s.currentLapTime;
    s.delta = s.bestLapTime > 0 ? s.currentLapTime - this.bestAt[k] : 0;
    if (this.pos >= 1) {
      this.pos -= 1;
      s.lastLapTime = s.currentLapTime;
      if (s.bestLapTime === 0 || s.lastLapTime < s.bestLapTime) s.bestLapTime = s.lastLapTime;
      s.currentLapTime = 0;
      s.lap++;
      s.fuel = Math.max(1, s.fuel - 3.6);
      if (Math.random() < 0.35) s.position = Math.max(1, s.position + (Math.random() < 0.6 ? -1 : 1));
      if (Math.random() < 0.5) this.setBias(s.brakeBias + (Math.random() < 0.5 ? -0.5 : 0.5));
    }
    s.predictedLap = s.bestLapTime > 0 ? s.bestLapTime + s.delta : 0;
    s.fuelPercent = (s.fuel / 90) * 100;
    s.fuelRemainingLaps = s.fuel / 3.6;
    s.waterTemp = 84 + Math.sin(this.time / 20) * 3;
    s.oilTemp = 98 + Math.sin(this.time / 27) * 4;
    if (s.flag && this.time > this.flagUntil) s.flag = "";
    s.spotterLeft = this.mode === "auto" && Math.sin(this.time / 7.3) > 0.93;
    s.spotterRight = this.mode === "auto" && Math.sin(this.time / 9.1 + 2) > 0.94;
  }
}

/** Formats a value the way the plugin does (dash format names). */
export function format(v: unknown, fmt?: string): string {
  if (v === undefined || v === null || v === "") return "";
  if (fmt === "text" || typeof v === "string") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  const n = v as number;
  switch (fmt) {
    case "laptime": {
      if (!n) return "";
      const m = Math.floor(n / 60), sec = n - m * 60;
      return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
    }
    case "delta": return (n > 0 ? "+" : n < 0 ? "-" : "+") + Math.abs(n).toFixed(2);
    case "gear": return n < 0 ? "R" : n === 0 ? "N" : String(n);
    case "int": return String(Math.round(n));
    default: {
      const m = /^0(\.(0+))?$/.exec(fmt || "0");
      return m ? n.toFixed(m[2] ? m[2].length : 0) : String(Math.round(n));
    }
  }
}
