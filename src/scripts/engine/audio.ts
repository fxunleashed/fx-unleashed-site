// A synthesised engine for the "Drive it" section: nothing is sampled or downloaded. Off until the visitor turns it on
// (browsers only allow sound after a click). Pitch follows RPM (4-cylinder-ish firing: rpm / 60 * 2), the filter opens
// with throttle, a little noise for intake, and a short crackle when the throttle closes at high revs.
export class EngineSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private oscs: OscillatorNode[] = [];
  private filter!: BiquadFilterNode;
  private noiseGain!: GainNode;
  private lastThrottle = 0;
  on = false;

  start() {
    if (this.ctx) { this.ctx.resume(); this.on = true; return; }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    this.filter = ctx.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.Q.value = 4;
    for (const [type, mult, gain, detune] of [["sawtooth", 1, 0.32, 0], ["sawtooth", 2, 0.16, 7], ["square", 0.5, 0.2, -5], ["triangle", 4, 0.05, 3]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g).connect(shaper);
      o.start(); (o as any).mult = mult; this.oscs.push(o);
    }
    // intake / exhaust noise
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = 0.7;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0;
    noise.connect(nf).connect(this.noiseGain).connect(this.master);
    noise.start();
    shaper.connect(this.filter).connect(this.master);
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.on = true;
  }

  stop() { this.on = false; if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); }

  update(rpm: number, throttle: number, limiter: boolean) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, f = Math.max(18, (rpm / 60) * 2);
    for (const o of this.oscs) o.frequency.setTargetAtTime(f * (o as any).mult * (limiter ? 1 + Math.random() * 0.02 : 1), t, 0.02);
    const th = throttle / 100;
    this.filter.frequency.setTargetAtTime(300 + th * 2600 + rpm * 0.15, t, 0.05);
    this.master.gain.setTargetAtTime(0.07 + th * 0.14, t, 0.05);
    this.noiseGain.gain.setTargetAtTime(th * 0.05, t, 0.05);
    // lift-off crackle
    if (this.lastThrottle > 0.7 && th < 0.2 && rpm > 5000) {
      for (let k = 0; k < 6; k++) this.noiseGain.gain.setValueAtTime(0.25 * Math.random(), t + 0.03 + k * 0.045);
      this.noiseGain.gain.setTargetAtTime(0, t + 0.35, 0.05);
    }
    this.lastThrottle = th;
  }
}
