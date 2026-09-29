// Copies what the site shows from the sibling repos, so they stay the one source:
//   plugin repo  docs/*.md, docs/legal/*.md, assets/brand/*          -> src/content/..., public/brand/
//   library repo index.json + every item's preview.png and dash.json -> public/library/ (offline copy; the live
//                                                                       library is read from GitHub at runtime)
// Paths default to sibling folders; override with FXU_PLUGIN_REPO / FXU_LIBRARY_REPO. Missing repos are skipped (the
// committed copies are used), so the site builds on its own too (CI).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const plugin = process.env.FXU_PLUGIN_REPO || path.resolve(root, "../SimagicRpmSync");
const library = process.env.FXU_LIBRARY_REPO || path.resolve(root, "../fx-unleashed-library");

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

let n = 0;
if (fs.existsSync(plugin)) {
  // usb-mode.md stays off the site: it is the developer reference with firmware internals (NEXT.md O4 review first)
  const docs = ["setup.md", "dash-format.md", "dash-designer.md"];
  for (const f of docs) if (fs.existsSync(path.join(plugin, "docs", f))) { copy(path.join(plugin, "docs", f), path.join(root, "src/content/docs", f)); n++; }
  for (const f of fs.readdirSync(path.join(plugin, "docs/legal")).filter(f => f.endsWith(".md") && f !== "README.md")) {
    copy(path.join(plugin, "docs/legal", f), path.join(root, "src/content/legal", f)); n++;
  }
  for (const f of fs.readdirSync(path.join(plugin, "assets/brand"))) { copy(path.join(plugin, "assets/brand", f), path.join(root, "public/brand", f)); n++; }
  copy(path.join(plugin, "assets/logo-nobg.png"), path.join(root, "public/brand/logo-nobg.png")); n++;
} else console.log("sync: plugin repo not found at " + plugin + " (using committed copies)");

if (fs.existsSync(path.join(library, "index.json"))) {
  copy(path.join(library, "index.json"), path.join(root, "public/library/index.json")); n++;
  for (const kind of ["dashes", "savers"]) {
    const dir = path.join(library, kind);
    if (!fs.existsSync(dir)) continue;
    for (const id of fs.readdirSync(dir)) for (const f of ["preview.png", "dash.json"]) {
      const src = path.join(dir, id, f);
      if (fs.existsSync(src)) { copy(src, path.join(root, "public/library", kind, id, f)); n++; }
    }
  }
} else console.log("sync: library repo not found at " + library + " (using committed copies)");

console.log(`sync: ${n} files`);
