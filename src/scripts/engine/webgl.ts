/** WebGL available (else pages show a still picture). Kept apart from the 3D code so checking doesn't load three.js. */
export function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
