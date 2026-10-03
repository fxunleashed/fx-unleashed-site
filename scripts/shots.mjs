// Screenshots of the site for checking a change: every page at desktop and phone width, full length, with the 3D
// stage run forward so the wheel is built and lit. Uses the Chrome already installed (puppeteer-core, no download).
//
//   npm run build && npm run preview      (in another terminal), then:
//   npm run shots [-- --base http://127.0.0.1:4321 --only /,/library/ --out shots]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg("base", "http://127.0.0.1:4321");
const out = arg("out", "shots");
const pages = (arg("only", "") || "/,/start/,/library/,/lab/,/docs/,/docs/dash-format/,/firmware/,/changelog/,/faq/,/legal/,/wheels/,/wheels/fx-pro/,/404-test/").split(",");
const chrome = arg("chrome", process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe");
const sizes = [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844, mobile: true }];

fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
for (const size of sizes) {
  for (const p of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: size.width, height: size.height, isMobile: !!size.mobile, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(base + p, { waitUntil: "networkidle2", timeout: 60000 }).catch(e => errors.push(String(e)));
    await page.evaluate(async () => {
      document.querySelectorAll(".reveal").forEach(e => e.classList.add("in"));
      for (const el of document.querySelectorAll(".title span, .hero .free, .hero .lead, .hero .ctas, .stats")) { el.style.animation = "none"; el.style.opacity = "1"; el.style.transform = "none"; }
      const s = window.stage;
      if (s?.advance) s.advance(9);
      await new Promise(r => setTimeout(r, 300));
    });
    const file = path.join(out, `${size.name}${p.replace(/\//g, "_") || "_"}.png`);
    await page.screenshot({ path: file, fullPage: true });
    // pages with scroll chapters (home): one viewport picture per chapter, camera moved there
    const chapters = await page.evaluate(() => document.querySelectorAll(".chapter").length);
    for (let c = 0; c < chapters; c++) {
      await page.evaluate(async i => {
        const el = document.querySelectorAll(".chapter")[i];
        window.scrollTo({ top: el.offsetTop + el.offsetHeight / 2 - innerHeight / 2, behavior: "instant" });
        dispatchEvent(new Event("scroll"));
        window.stage?.advance?.(4);
        await new Promise(r => setTimeout(r, 200));
      }, c);
      await page.screenshot({ path: file.replace(/\.png$/, `.chapter${c + 1}.png`) });
    }
    console.log(`${file}${errors.length ? "  ERRORS: " + errors.join(" | ") : ""}`);
    await page.close();
  }
}
await browser.close();
