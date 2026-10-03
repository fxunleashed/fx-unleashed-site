// The Download buttons point at the newest release (the stable one if there is one, else the newest pre-release) and
// say which version it is. Without the answer they keep their link to the releases page.
import { site } from "../config";

const buttons = [...document.querySelectorAll<HTMLAnchorElement>("[data-download]")];
if (buttons.length) {
  fetch(site.releasesApi)
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list: any[]) => {
      const open = list.filter(r => !r.draft);
      const rel = open.find(r => !r.prerelease) ?? open[0];
      if (!rel) return;
      for (const a of buttons) {
        a.href = rel.html_url;
        const v = a.querySelector(".v");
        if (v) v.textContent = rel.tag_name + (rel.prerelease ? " (beta)" : "");
      }
    })
    .catch(() => {});
}
