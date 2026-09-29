// The wheels the site knows. To add one: a JSON file like fx-pro.json (outline, LEDs, screen, groups), then list it
// here. Everything wheel-specific on the site (the 3D model, the light editor, the wheel pages) is built from these.
import fxPro from "./fx-pro.json";

export interface WheelLed { i: number; group: string; x: number; y: number; r: number; name: string; label?: string }
export interface Wheel {
  id: string; name: string; maker: string; status: "supported" | "beta" | "planned"; tagline: string;
  size: [number, number]; depthMm: number; widthMm: number; outline: [number, number][];
  bezel: { x: number; y: number; w: number; h: number; r: number };
  screen: { x: number; y: number; w: number; h: number; px: [number, number] };
  leds: WheelLed[]; groups: Record<string, { label: string; leds: number[] }>;
  features: { title: string; text: string }[];
}

export const wheels: Wheel[] = [fxPro as unknown as Wheel];
export const defaultWheel = wheels[0];
export const wheelById = (id: string) => wheels.find(w => w.id === id);
