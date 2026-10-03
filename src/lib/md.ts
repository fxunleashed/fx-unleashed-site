// Markdown from src/content (synced from the plugin repo) to HTML: heading anchors, a table of contents, and links
// between the plugin's docs rewritten to the site's pages.
import { Marked } from "marked";
import { site } from "../config";

export interface TocEntry { depth: number; text: string; id: string }

export const slug = (s: string) =>
  s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_]/g, "").replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-");

const DOC_PAGES: Record<string, string> = {
  "setup.md": "/start/", "dash-format.md": "/docs/dash-format/", "dash-designer.md": "/docs/dash-designer/",
  "CONTRIBUTING.md": "/docs/library-submit/", "TERMS.md": "/legal/#library-terms",
};

export function render(md: string): { html: string; toc: TocEntry[]; title: string } {
  const toc: TocEntry[] = [];
  let title = "";
  const seen = new Map<string, number>();
  const m = new Marked({ gfm: true });
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, "");
        let id = slug(plain);
        const n = seen.get(id) ?? 0; seen.set(id, n + 1); if (n) id += "-" + n;
        if (depth === 1 && !title) title = plain;
        if (depth === 2 || depth === 3) toc.push({ depth, text: plain, id });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>`;
      },
      link({ href, title: t, tokens }) {
        const text = this.parser.parseInline(tokens);
        let h = href ?? "";
        // the guide is also read on GitHub, where links to this site are absolute: keep them in the same tab here
        h = h.replace(/^https:\/\/(www\.)?fxunleashed\.com(?=\/|$)/, "") || "/";
        const file = h.split("#")[0].split("/").pop() ?? "";
        if (DOC_PAGES[file]) h = DOC_PAGES[file] + (h.includes("#") ? "#" + h.split("#")[1] : "");
        // other plugin docs aren't pages here: link them on GitHub
        else if (/\.md$/.test(file) && !/^https?:/.test(h)) h = `https://github.com/${site.pluginRepo}/blob/main/docs/${file}`;
        const ext = /^https?:/.test(h) ? ' rel="noopener" target="_blank"' : "";
        return `<a href="${h}"${t ? ` title="${t}"` : ""}${ext}>${text}</a>`;
      },
    },
  });
  const html = m.parse(md) as string;
  return { html, toc, title };
}

/** Every Markdown file in a content folder, as { name: text }. */
export const docs = import.meta.glob("../content/docs/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export const legal = import.meta.glob("../content/legal/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export const byName = (files: Record<string, string>, name: string) =>
  Object.entries(files).find(([p]) => p.endsWith("/" + name))?.[1] ?? "";
