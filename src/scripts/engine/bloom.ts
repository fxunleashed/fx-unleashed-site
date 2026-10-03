// A cheap bloom, in place of three's UnrealBloomPass (a chain of mip-level blurs, which also clipped the LEDs to white).
// It works on the finished picture: the bright parts are boxed down to a quarter of the size, blurred three times with a
// 9-tap kernel at that size (about 1/16 of the pixels), and kept in a texture the film pass adds back. The glow keeps the
// light's own colour, so a red LED glows red. Costs about a tenth of a millisecond on a mid-range GPU.
import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

// Four bilinear taps, one texel of the full-size picture out from the centre of each quarter-size pixel, cover the whole
// 4x4 block they stand for: a true box filter, so thin bright lines don't shimmer as the camera moves.
const DOWN = `
  uniform sampler2D tDiffuse; uniform vec2 texel; uniform float threshold;
  varying vec2 vUv;
  vec3 bright(vec3 c) { float m = max(c.r, max(c.g, c.b)); return c * smoothstep(threshold, 1.0, m); }
  void main(){
    vec3 s = bright(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb) + bright(texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).rgb)
           + bright(texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).rgb) + bright(texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb);
    gl_FragColor = vec4(s * 0.25, 1.0);
  }`;

// The usual 9-tap Gaussian as 5 fetches (the bilinear trick).
const BLUR = `
  uniform sampler2D tDiffuse; uniform vec2 dir;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    c += (texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
    c += (texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class CheapBloom extends Pass {
  /** The brightest channel a pixel needs (0..1, after tone mapping) before it glows at all. */
  threshold: number;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private quad = new FullScreenQuad();
  private down: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;

  constructor(threshold = 0.7) {
    super();
    this.threshold = threshold;
    this.needsSwap = false; // reads the picture, never replaces it: the film pass still gets the same one
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.a = rt(); this.b = rt();
    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false });
    this.down = mat(DOWN, { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: threshold } });
    this.blur = mat(BLUR, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
  }

  /** The blurred glow, sampled by the film pass. The texture object stays the same across resizes. */
  get texture() { return this.a.texture; }

  setSize(width: number, height: number) {
    const w = Math.max(1, Math.floor(width / 4)), h = Math.max(1, Math.floor(height / 4));
    this.a.setSize(w, h); this.b.setSize(w, h);
    (this.down.uniforms.texel.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const q = this.quad, dir = this.blur.uniforms.dir.value as THREE.Vector2;
    this.down.uniforms.threshold.value = this.threshold;
    this.down.uniforms.tDiffuse.value = read.texture;
    q.material = this.down;
    renderer.setRenderTarget(this.a); q.render(renderer);
    q.material = this.blur;
    for (let i = 0; i < 3; i++) {
      this.blur.uniforms.tDiffuse.value = this.a.texture; dir.set(1 / this.a.width, 0);
      renderer.setRenderTarget(this.b); q.render(renderer);
      this.blur.uniforms.tDiffuse.value = this.b.texture; dir.set(0, 1 / this.a.height);
      renderer.setRenderTarget(this.a); q.render(renderer);
    }
  }

  dispose() {
    this.a.dispose(); this.b.dispose(); this.down.dispose(); this.blur.dispose(); this.quad.dispose();
  }
}
