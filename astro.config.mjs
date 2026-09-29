import { defineConfig } from "astro/config";

// Static site: `npm run build` writes dist/ for GitHub Pages or Cloudflare Pages.
export default defineConfig({
  site: "https://fxunleashed.com",
  trailingSlash: "ignore",
  build: { format: "directory" },
});
