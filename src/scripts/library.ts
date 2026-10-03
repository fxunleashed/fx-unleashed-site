// The community library: the live index from GitHub (falls back to the copy built into the site), item URLs,
// and talking to the plugin on the visitor's PC for one-click installs.
import { site } from "../config";

export interface LibraryItem {
  Id: string; Kind: "dash" | "saver"; Name: string; Author: string; Description?: string; Version: string;
  Games?: string[]; Cars?: string[]; Tags?: string[]; License?: string; Source?: string;
  Created?: string; Updated?: string; FormatVersion?: number; MinPlugin?: string;
  BytesStatic?: number; BytesPerSecond?: number; Sha256?: string; DashUrl: string; PreviewUrl: string;
}
export interface LibraryIndex { Schema: number; Generated: string; Items: LibraryItem[] }

let base = site.libraryBase;

export async function loadIndex(): Promise<LibraryIndex> {
  try {
    const r = await fetch(site.libraryBase + "index.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    base = site.libraryBase;
    return await r.json();
  } catch {
    base = "/library/"; // the copy the site was built with
    return await (await fetch("/library/index.json")).json();
  }
}

export const url = (rel: string) => base + rel;

export type PluginState = { available: boolean; version?: string; installed?: { id: string; kind: string; version: string }[]; blocked?: boolean };

/**
 * Asks the plugin on this PC (its local server) whether it's there. Only call this when the visitor has asked for it (a
 * button): browsers ask the visitor for permission to reach apps on their device (Chrome's "local network access") the
 * first time a page tries, and a page that does it on load looks like it is snooping. The plugin answers only this site.
 */
export async function pluginState(): Promise<PluginState> {
  const root = `http://127.0.0.1:${site.pluginPort}/api/library/`;
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 1500);
    const st = await (await fetch(root + "status", { signal: ctl.signal })).json();
    clearTimeout(tm);
    // an older plugin (no library routes) answers with an error: treat it as not there
    if (st?.plugin !== "FX Unleashed") return { available: false };
    const installed = await (await fetch(root + "installed")).json();
    return { available: !!st.available, version: st.version, installed: Array.isArray(installed) ? installed : [] };
  } catch (e) {
    return { available: false, blocked: String(e).includes("blocked") };
  }
}

export async function installInPlugin(item: LibraryItem) {
  const r = await fetch(`http://127.0.0.1:${site.pluginPort}/api/library/install?kind=${item.Kind}&id=${encodeURIComponent(item.Id)}`, { method: "POST" });
  return (await r.json()) as { installed: boolean; error?: string; version?: string };
}
