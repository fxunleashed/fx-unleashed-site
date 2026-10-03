// The wheels the site knows. To add one: a JSON file like fx-pro.json (outline, LEDs, screen, groups), then list it
// here. Everything wheel-specific on the site (the 3D model, the light editor, the wheel pages) is built from these.
import fxPro from "./fx-pro.json";

export interface WheelLed { i: number; group: string; x: number; y: number; r: number; name: string; label?: string }
export interface Wheel {
  id: string; name: string; maker: string; status: "supported" | "beta" | "planned"; tagline: string;
  size: [number, number]; depthMm: number; widthMm: number; outline: [number, number][];
  /** Faceplate and pod thickness. */
  plateMm?: number; podMm?: number;
  /** See-through openings in the faceplate (both sides, as drawn): thumb openings, windows round the knobs. */
  windows?: [number, number][][];
  /** Raised plates the buttons sit on (left side; mirrored), with their own holes. */
  pods?: { outer: [number, number][]; holes: [number, number][][] }[];
  /** Grips (left side; mirrored): a polygon in outline units, built thicker and rounded. */
  grips?: { points: [number, number][] }[];
  /** Paddles behind the faceplate (left side; mirrored): rounded boxes, `back` mm behind the plate. */
  paddles?: { x: number; y: number; w: number; h: number; r: number; back: number }[];
  /** Rollers (left side; mirrored): "upright" rolls sideways (axis up the face, tilted), "wheel" rolls up and down. */
  rollers?: { kind: "upright" | "wheel"; x: number; y: number; r: number; len: number; tilt?: number; bracket?: [number, number, number, number] }[];
  funky?: { x: number; y: number; r: number };
  /** Screw heads (left side; mirrored). */
  screws?: [number, number][];
  /** Electronics housing behind the centre. */
  housing?: { x: number; y: number; w: number; h: number; r: number; depthMm: number };
  /** Quick release half on the back, centred at x, y; sizes [diameter, length] in mm. */
  qr?: { x: number; y: number; pcdMm: number; flangeMm: [number, number]; collarMm: [number, number]; stepMm: [number, number]; boreMm: [number, number] };
  bezel: { x: number; y: number; w: number; h: number; r: number };
  screen: { x: number; y: number; w: number; h: number; px: [number, number] };
  leds: WheelLed[]; groups: Record<string, { label: string; leds: number[] }>;
  features: { title: string; text: string }[];
}

export const wheels: Wheel[] = [fxPro as unknown as Wheel];
export const defaultWheel = wheels[0];
export const wheelById = (id: string) => wheels.find(w => w.id === id);
