// The newest custom firmware, straight from the firmware repository's latest release: the build number, file name, size and
// SHA-256 are read from GitHub (the release file's own checksum), so nothing here is typed by hand when a new build ships.
// Without an answer (offline, rate limit) the pages keep their plain links to the releases page.
import { site } from "../config";

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];
const fill = (attr: string, text: string) => all(`[${attr}]`).forEach(e => (e.textContent = text));
const size = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");

// a link to #check or #risks lands inside a closed "For the curious" box: open it
const openTarget = () => {
  const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  const box = el?.closest("details");
  if (box && !box.open) { box.open = true; el!.scrollIntoView(); }
};
openTarget();
addEventListener("hashchange", openTarget);

fetch(site.firmwareApi, { headers: { Accept: "application/vnd.github+json" } })
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((rel: any) => {
    const file = (rel.assets ?? []).find((a: any) => /\.sfu$/i.test(a.name));
    if (!file) return;
    const build = /build\s*(\d+)/i.exec(`${rel.tag_name} ${file.name}`)?.[1];
    const sha = /^sha256:([0-9a-f]{64})$/i.exec(file.digest ?? "")?.[1];
    fill("data-fw-build", build ? `Build ${build}` : rel.name || rel.tag_name);
    fill("data-fw-file", file.name);
    fill("data-fw-size", size(file.size));
    fill("data-fw-bytes", Number(file.size).toLocaleString("en-US") + " bytes");
    if (sha) fill("data-fw-sha", sha.toUpperCase());
    // every link to the firmware releases goes straight to the file
    all<HTMLAnchorElement>("[data-fw-download], a[href$='fx-unleashed-firmware/releases/latest']").forEach(a => (a.href = file.browser_download_url));
  })
  .catch(() => {});
