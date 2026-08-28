/** Playback-path radio chain: larger buffer, tight low end, present mids, air. */

export type RadioChain = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  setVolume: (n: number) => void;
};

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function saturatorCurve(amount: number) {
  const n = 4096;
  const curve = new Float32Array(n);
  const k = Math.max(0, amount);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export function createRadioChain(el: HTMLAudioElement): RadioChain | null {
  const Ctor =
    window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: "playback" });
  } catch {
    return null;
  }

  const src = ctx.createMediaElementSource(el);

  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 48;
  rumble.Q.value = 0.7;

  const mud = ctx.createBiquadFilter();
  mud.type = "lowshelf";
  mud.frequency.value = 200;
  mud.gain.value = -2.8;

  const body = ctx.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = 920;
  body.Q.value = 0.7;
  body.gain.value = 1.3;

  const bite = ctx.createBiquadFilter();
  bite.type = "peaking";
  bite.frequency.value = 2650;
  bite.Q.value = 1.05;
  bite.gain.value = 2.8;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 4800;
  presence.Q.value = 1.1;
  presence.gain.value = 3.2;

  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 9000;
  air.gain.value = 3.4;

  const sat = ctx.createWaveShaper();
  sat.curve = saturatorCurve(0.55);
  sat.oversample = "4x";

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 2.4;
  glue.attack.value = 0.008;
  glue.release.value = 0.14;

  const makeup = ctx.createGain();
  makeup.gain.value = 1.18;

  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -1.2;
  limit.knee.value = 0.3;
  limit.ratio.value = 20;
  limit.attack.value = 0.002;
  limit.release.value = 0.06;

  const vol = ctx.createGain();
  vol.gain.value = 0.72;

  src
    .connect(rumble)
    .connect(mud)
    .connect(body)
    .connect(bite)
    .connect(presence)
    .connect(air)
    .connect(sat)
    .connect(glue)
    .connect(makeup)
    .connect(limit)
    .connect(vol)
    .connect(ctx.destination);

  el.volume = 1;

  return {
    ctx,
    resume: async () => {
      if (ctx.state === "suspended") await ctx.resume();
    },
    setVolume: (n: number) => {
      vol.gain.setTargetAtTime(Math.min(1, Math.max(0, n)), ctx.currentTime, 0.03);
    },
  };
}
