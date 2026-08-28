/** Gentle playback chain. Presence without scooping the mix. */

export type RadioChain = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  setVolume: (n: number) => void;
};

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export async function attachRadioChain(el: HTMLAudioElement): Promise<RadioChain | null> {
  const Ctor =
    window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: "playback" });
  } catch {
    return null;
  }

  try {
    await ctx.resume();
  } catch {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
    return null;
  }
  if (ctx.state !== "running") {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
    return null;
  }

  const src = ctx.createMediaElementSource(el);

  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 28;
  rumble.Q.value = 0.5;

  const body = ctx.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = 180;
  body.Q.value = 0.7;
  body.gain.value = 0.8;

  const bite = ctx.createBiquadFilter();
  bite.type = "peaking";
  bite.frequency.value = 3000;
  bite.Q.value = 0.85;
  bite.gain.value = 1.6;

  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 10000;
  air.gain.value = 1.8;

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -22;
  glue.knee.value = 18;
  glue.ratio.value = 1.6;
  glue.attack.value = 0.012;
  glue.release.value = 0.22;

  const makeup = ctx.createGain();
  makeup.gain.value = 1.12;

  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -1.5;
  limit.knee.value = 2;
  limit.ratio.value = 12;
  limit.attack.value = 0.003;
  limit.release.value = 0.1;

  const vol = ctx.createGain();
  vol.gain.value = 0.78;

  src
    .connect(rumble)
    .connect(body)
    .connect(bite)
    .connect(air)
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
