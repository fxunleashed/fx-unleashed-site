// Renders the plugin's dash format (dash.json, docs/dash-format.md) on an 800x480 canvas, live, from the site's car
// simulation. It's a browser approximation of the wheel: the screen's own fonts are stood in for by a web font drawn
// in each font's real cell size (FONTS), so layouts and letter spacing look as they do on the wheel.
import { FONTS } from "./fonts";
import { format, type Car } from "./demo";

export interface DashElement {
  Type: string; Name?: string; X: number; Y: number; W: number; H: number;
  Color?: string; Fill?: string; Border?: number; Radius?: number; Text?: string; Font?: number; Align?: string;
  Bind?: string; Format?: string; Empty?: string; PreviewText?: string; Samples?: string[];
  PositiveColor?: string; NegativeColor?: string; Background?: string;
  Min?: number; Max?: number; Orientation?: string; Reverse?: boolean;
  Visible?: string | string[]; PreviewVisible?: boolean; ColorBind?: string; ColorStops?: { Value: number; Color: string }[];
  Segments?: number; SegmentX?: number[]; Pitch?: number; SegmentWidth?: number; Range?: number; SegmentColor?: string;
  Colors?: string[]; Angle?: number; Image?: string; Opacity?: number; Scale?: number;
}
export interface Dash { Name?: string; Author?: string; Elements: DashElement[]; Images?: Record<string, string> }

export const SCREEN_W = 800, SCREEN_H = 480;
const FACE = '"Chakra Petch", "Rajdhani", "Segoe UI", sans-serif';

function rgba(c: string | undefined, fallback = "#ffffff") {
  c = c || fallback;
  if (/^#[0-9a-f]{8}$/i.test(c)) { // #AARRGGBB
    const a = parseInt(c.slice(1, 3), 16) / 255;
    return `rgba(${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${parseInt(c.slice(7, 9), 16)},${a})`;
  }
  return c;
}

function stopsColor(stops: { Value: number; Color: string }[], v: number) {
  const s = [...stops].sort((a, b) => a.Value - b.Value);
  if (v <= s[0].Value) return s[0].Color;
  for (let i = 1; i < s.length; i++) if (v <= s[i].Value) {
    const t = (v - s[i - 1].Value) / (s[i].Value - s[i - 1].Value || 1);
    const a = parseInt(s[i - 1].Color.slice(-6), 16), b = parseInt(s[i].Color.slice(-6), 16);
    const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
    return `rgb(${ch(a >> 16, b >> 16)},${ch((a >> 8) & 255, (b >> 8) & 255)},${ch(a & 255, b & 255)})`;
  }
  return s[s.length - 1].Color;
}

export class DashRenderer {
  private images = new Map<string, HTMLImageElement>();
  padLeft = 10;
  padTop = 20;

  constructor(public dash: Dash) {
    for (const [name, b64] of Object.entries(dash.Images ?? {})) {
      const img = new Image();
      img.src = b64.startsWith("data:") ? b64 : "data:image/png;base64," + b64;
      this.images.set(name, img);
    }
  }

  private value(car: Car | null, bind?: string): unknown {
    if (!bind) return undefined;
    if (!car) return undefined;
    const key = bind.replace(/^prop:/, "");
    return (car.s as Record<string, unknown>)[key];
  }

  private visible(e: DashElement, car: Car | null) {
    if (!e.Visible) return true;
    const list = Array.isArray(e.Visible) ? e.Visible : [e.Visible];
    return list.every(cond => {
      if (!car) return e.PreviewVisible !== false;
      if (/changed\(\s*\d+\s*,\s*\[BrakeBias\]\s*\)/i.test(cond)) return car.biasAge < 2;
      const v = (car.s as Record<string, unknown>)[cond];
      if (v !== undefined) return !!v && v !== "0";
      return e.PreviewVisible !== false && !/^ncalc:|^js:/i.test(cond) ? true : false;
    });
  }

  private text(ctx: CanvasRenderingContext2D, s: string, e: DashElement, color: string) {
    const [h, cell] = FONTS[e.Font ?? 5] ?? [24, 24];
    const x0 = e.X + this.padLeft, y0 = e.Y + this.padTop;
    // the screen draws each glyph in a cell; narrow "963" digits have cells narrower than their height
    const cw = (ch: string) => (/[0-9]/.test(ch) ? cell : ch === "." || ch === ":" ? cell * 0.45 : ch === " " ? cell * 0.5 : cell);
    const chars = [...s];
    let width = 0; const widths = chars.map(c => { const w = cw(c); width += w; return w; });
    const fit = Math.min(1, e.W / Math.max(1, width));
    const align = e.Align === "center" ? 1 : e.Align === "right" ? 2 : 0;
    let x = align === 0 ? x0 : align === 1 ? x0 + (e.W - width * fit) / 2 : x0 + e.W - width * fit;
    const cy = y0 + e.H / 2;
    const px = h * (h >= 90 ? 0.92 : 0.8) * fit;
    ctx.font = `${h >= 64 ? 600 : 500} ${px}px ${FACE}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    chars.forEach((c, i) => { ctx.fillText(c, x + (widths[i] * fit) / 2, cy + px * 0.04); x += widths[i] * fit; });
  }

  draw(ctx: CanvasRenderingContext2D, car: Car | null) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (const e of this.dash.Elements) {
      if (!this.visible(e, car)) continue;
      const x = e.X + this.padLeft, y = e.Y + this.padTop;
      ctx.globalAlpha = e.Opacity !== undefined ? e.Opacity / 100 : 1;
      let color = rgba(e.Color);
      if (e.ColorBind) {
        const v = this.value(car, e.ColorBind);
        if (typeof v === "number" && e.ColorStops?.length) color = stopsColor(e.ColorStops, v);
        else if (typeof v === "string" && v.startsWith("#")) color = rgba(v);
      }
      switch (e.Type) {
        case "rect": ctx.fillStyle = color; ctx.fillRect(x, y, e.W, e.H); break;
        case "box": {
          ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, e.W - 1, e.H - 1, e.Radius ?? 0);
          if (e.Fill) { ctx.fillStyle = rgba(e.Fill); ctx.fill(); }
          if ((e.Border ?? 1) > 0) { ctx.strokeStyle = color; ctx.lineWidth = e.Border ?? 1; ctx.stroke(); }
          break;
        }
        case "ellipse": {
          ctx.beginPath(); ctx.ellipse(x + e.W / 2, y + e.H / 2, e.W / 2, e.H / 2, 0, 0, Math.PI * 2);
          if (e.Fill) { ctx.fillStyle = rgba(e.Fill); ctx.fill(); }
          if (e.Border) { ctx.strokeStyle = color; ctx.lineWidth = e.Border; ctx.stroke(); } else if (!e.Fill) { ctx.fillStyle = color; ctx.fill(); }
          break;
        }
        case "gradient": {
          const a = ((e.Angle ?? 90) * Math.PI) / 180, cx = x + e.W / 2, cy = y + e.H / 2, r = Math.max(e.W, e.H) / 2;
          const gr = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          (e.Colors ?? ["#000", "#fff"]).forEach((c, i, all) => gr.addColorStop(i / Math.max(1, all.length - 1), rgba(c)));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x, y, e.W, e.H, e.Radius ?? 0); ctx.fill();
          break;
        }
        case "image": { const img = this.images.get(e.Image ?? ""); if (img?.complete) ctx.drawImage(img, x, y, e.W, e.H); break; }
        case "label": this.text(ctx, e.Text ?? "", e, color); break;
        case "value": {
          const v = car ? this.value(car, e.Bind) : undefined;
          let s = car ? format(v, e.Format) : (e.PreviewText ?? (e.Samples?.[0] ?? ""));
          if (car && (s === "" || (e.Format === "laptime" && !v))) s = e.Empty ?? (e.PreviewText && v === undefined ? e.PreviewText : "");
          if (car && v === undefined && e.PreviewText) s = e.PreviewText;
          let c = color;
          if (typeof v === "number") { if (v > 0 && e.PositiveColor) c = rgba(e.PositiveColor); if (v < 0 && e.NegativeColor) c = rgba(e.NegativeColor); }
          if (e.Background) { ctx.fillStyle = rgba(e.Background); ctx.fillRect(x, y, e.W, e.H); }
          this.text(ctx, s, e, c);
          break;
        }
        case "bar": {
          const v = Number(this.value(car, e.Bind) ?? (e.Min ?? 0) + ((e.Max ?? 100) - (e.Min ?? 0)) * 0.6);
          let t = (v - (e.Min ?? 0)) / (((e.Max ?? 100) - (e.Min ?? 0)) || 1);
          t = Math.max(0, Math.min(1, t));
          if (e.Fill) { ctx.fillStyle = rgba(e.Fill); ctx.fillRect(x, y, e.W, e.H); }
          ctx.fillStyle = color;
          if (e.Orientation === "vertical") { const h = e.H * t; ctx.fillRect(x, e.Reverse ? y : y + e.H - h, e.W, h); }
          else { const w = e.W * t; ctx.fillRect(e.Reverse ? x + e.W - w : x, y, w, e.H); }
          break;
        }
        case "deltabar": {
          const n = e.Segments ?? 7, v = Number(this.value(car, e.Bind) ?? -0.4), range = e.Range ?? 1;
          const xs = e.SegmentX?.length === n * 2 ? e.SegmentX : Array.from({ length: n * 2 }, (_, k) => e.X + Math.round(k * (e.Pitch ?? 40)));
          const lit = Math.round(Math.min(1, Math.abs(v) / range) * n);
          xs.forEach((sx, k) => {
            const leftHalf = k < n, fromCentre = leftHalf ? n - 1 - k : k - n;
            const on = fromCentre < lit && ((v > 0 && leftHalf) || (v < 0 && !leftHalf));
            ctx.fillStyle = on ? rgba(v > 0 ? e.PositiveColor : e.NegativeColor, "#fff") : rgba(e.SegmentColor, "#333");
            ctx.fillRect(sx + this.padLeft, y, e.SegmentWidth ?? 30, e.H);
          });
          break;
        }
      }
    }
    ctx.restore();
  }
}

/** The logo screensaver: the badge on black, its rev dots sweeping like the plugin's. */
export function drawLogoSaver(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, t: number) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const size = 420, x = (SCREEN_W - size) / 2, y = (SCREEN_H - size) / 2;
  if (logo?.complete) ctx.drawImage(logo, x, y, size, size);
  const k = size / 500, ph = t % 4;
  for (let i = 0; i < 13; i++) {
    const lit = ph < 2 ? ph >= (i * 2) / 13 : ph < 2.8 ? Math.floor((ph - 2) * 5) % 2 === 0 : false;
    ctx.fillStyle = ph >= 2 && ph < 2.8 && lit ? "#ff1414" : lit ? "#ffffff" : "#5a0a0a";
    ctx.beginPath(); ctx.arc(x + (169.5 + i * 13.33) * k, y + 103 * k, 3.6, 0, Math.PI * 2); ctx.fill();
  }
}
