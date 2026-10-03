// Pictures of the 3D wheel alone from several camera shots, for checking the model (not the pages):
//   npm run build && npm run preview, then: node scripts/wheel-shots.mjs [--base http://127.0.0.1:4321] [--out shots]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg("base", "http://127.0.0.1:4321");
const out = arg("out", "shots");
const chrome = arg("chrome", process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe");
const shots = (arg("shots", "") || "front,hero,controls,side,back,backQr").split(",");
// extra camera shots for the model: a three-quarter view of the back, close on the quick release
const extra = {
  backQr: { cam: [1.3, 0.5, -2.2], look: [0, 0.05, -0.2], rot: [0, 0, 0] },
};

fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(base + "/", { waitUntil: "networkidle2", timeout: 60000 });
// the wheel alone: hide the page's text and chrome (scrolling would move the camera to a chapter's shot)
await page.addStyleTag({ content: "body > *:not(:has(canvas)) { visibility: hidden !important } main > *:not(:has(canvas)), header, nav, footer { visibility: hidden !important }" });
for (const name of shots) {
  await page.evaluate(async (name, extra) => {
    const s = window.stage;
    s.autoSpin = 0;
    if (extra[name]) { s.shot = extra[name]; } else s.setShot(name);
    s.advance(6);
    await new Promise(r => setTimeout(r, 200));
  }, name, extra);
  await page.screenshot({ path: path.join(out, `wheel-${name}.png`) });
}
console.log(errors.length ? "errors:\n" + errors.join("\n") : "no page errors");
await browser.close();
