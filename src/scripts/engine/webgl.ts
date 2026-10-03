/** WebGL available (else pages show a still picture). Kept apart from the 3D code so checking doesn't load three.js. */
let available: boolean | undefined;

export function webglOk() {
  if (available !== undefined) return available;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    available = !!gl;
    // a probe, not a renderer: hand the context back (browsers allow about 16 at once and drop the oldest, which would be the real one)
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { available = false; }
  return available;
}
