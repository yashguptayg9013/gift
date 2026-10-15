"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { MEDIA } from "@/lib/motion";

const BARS = 72;
/** A gentle Am9 voicing (Hz). */
const CHORD = [110, 164.81, 196, 246.94, 261.63];

type Engine = { ctx: AudioContext; master: GainNode; analyser: AnalyserNode };

function createEngine(): Engine {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.6;

  // Very slow filter sweep so the pad breathes.
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoDepth.gain.value = 450;
  lfo.connect(lfoDepth).connect(filter.frequency);
  lfo.start();

  CHORD.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = freq;
    osc.detune.value = (i % 2 ? 1 : -1) * 4;
    gain.gain.value = i === 0 ? 0.22 : 0.09;
    osc.connect(gain).connect(filter);
    osc.start();
  });

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.85;
  filter.connect(master).connect(analyser).connect(ctx.destination);
  return { ctx, master, analyser };
}

/** Bell-shaped resting profile for the bars. */
const envelope = (i: number) => 0.12 + 0.55 * Math.exp(-Math.pow((i - BARS / 2) / (BARS / 5), 2));

/**
 * Decorative waveform plus an optional, opt-in demo tone. Nothing
 * plays until the visitor presses play; while the demo plays the bars
 * follow that tone, otherwise they idle (only while on screen).
 */
export function SoundVisualizer({ visualNote, demoNote }: { visualNote: string; demoNote: string }) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const idle = useRef<gsap.core.Tween | null>(null);
  const inView = useRef(false);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const volumeId = useId();

  // Idle animation — runs only when visible and motion is allowed.
  useGSAP(
    () => {
      const bars = gsap.utils.toArray<HTMLElement>("[data-bar]", root.current);
      gsap.set(bars, { scaleY: (i) => envelope(i) });
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        idle.current = gsap.to(bars, {
          scaleY: (i) => envelope(i) * gsap.utils.random(0.35, 1.6),
          duration: 1.1,
          ease: "sine.inOut",
          paused: true,
          stagger: { each: 0.025, repeat: -1, yoyo: true, from: "center" },
        });
        ScrollTrigger.create({
          trigger: root.current,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => {
            inView.current = self.isActive;
            if (playingRef.current) return;
            if (self.isActive) idle.current?.play();
            else idle.current?.pause();
          },
        });
        return () => {
          idle.current = null;
        };
      });
    },
    { scope: root },
  );

  // While the demo plays, drive the bars from its frequency data.
  useEffect(() => {
    playingRef.current = playing;
    if (!playing || !engine.current) return;
    idle.current?.pause();
    const { analyser } = engine.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bars = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-bar]") ?? []);
    let frame = 0;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      bars.forEach((bar, i) => {
        const distance = Math.abs(i - BARS / 2) / (BARS / 2);
        const bin = Math.floor(2 + distance * 40);
        const value = data[bin] / 255;
        bar.style.transform = `scaleY(${Math.max(0.06, value * envelope(i) * 1.7)})`;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      bars.forEach((bar, i) => (bar.style.transform = `scaleY(${envelope(i)})`));
      if (inView.current) idle.current?.play();
    };
  }, [playing]);

  useEffect(() => {
    const e = engine.current;
    if (e && playing) e.master.gain.setTargetAtTime(volume * 0.35, e.ctx.currentTime, 0.08);
  }, [volume, playing]);

  useEffect(() => () => void engine.current?.ctx.close(), []);

  const toggle = async () => {
    if (!engine.current) engine.current = createEngine();
    const { ctx, master } = engine.current;
    if (!playing) {
      await ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(volume * 0.35, ctx.currentTime, 0.6);
      setPlaying(true);
    } else {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setPlaying(false);
      window.setTimeout(() => {
        if (engine.current?.ctx && engine.current.master.gain.value < 0.01) void engine.current.ctx.suspend();
      }, 1200);
    }
  };

  return (
    <div ref={root} className="mt-20 md:mt-28">
      <div aria-hidden className="flex h-28 items-center justify-between md:h-44">
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            data-bar
            className={
              i === BARS / 2
                ? "h-full w-[2px] origin-center bg-crimson"
                : "h-full w-px origin-center bg-silver/60 md:w-[2px]"
            }
            style={{ transform: `scaleY(${envelope(i)})` }}
          />
        ))}
      </div>
      <p className="t-label mt-4 normal-case tracking-[0.06em]">{visualNote}</p>

      <div className="mt-12 grid gap-6 border-t border-line pt-8 md:grid-cols-12 md:items-center">
        <div className="flex items-center gap-6 md:col-span-5">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className="group flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line-strong text-silver transition-colors duration-300 hover:border-silver hover:text-white"
          >
            {playing ? <Pause aria-hidden size={18} strokeWidth={1.25} /> : <Play aria-hidden size={18} strokeWidth={1.25} className="ml-0.5" />}
            <span className="sr-only">{playing ? "Pause demo tone" : "Play demo tone"}</span>
          </button>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={volumeId} className="t-label">
              Demo volume
            </label>
            <input
              id={volumeId}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="range w-full max-w-[16rem] cursor-pointer"
            />
          </div>
        </div>
        <p className="t-body md:col-span-6 md:col-start-7" role="note">
          {demoNote}
        </p>
      </div>
    </div>
  );
}
