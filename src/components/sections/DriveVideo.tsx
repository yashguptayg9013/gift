"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ResolvedVideo } from "@/data/types";
import { MEDIA } from "@/lib/motion";

/**
 * Muted, looping footage that plays only while on screen. Never
 * autoplays with reduced motion, and always offers a pause control.
 */
export function DriveVideo({ video }: { video: ResolvedVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const userPaused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia(MEDIA.reduced).matches) userPaused.current = true;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPaused.current) void el.play().catch(() => setPaused(true));
        else el.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    const sync = () => setPaused(el.paused);
    el.addEventListener("play", sync);
    el.addEventListener("pause", sync);
    return () => {
      observer.disconnect();
      el.removeEventListener("play", sync);
      el.removeEventListener("pause", sync);
    };
  }, []);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      userPaused.current = false;
      void el.play();
    } else {
      userPaused.current = true;
      el.pause();
    }
  };

  return (
    <>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        src={video.src}
        poster={video.poster.available ? video.poster.src : undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={video.label}
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute bottom-6 right-[var(--gutter)] z-10 flex h-11 items-center gap-2 border border-line-strong bg-obsidian/60 px-4 text-silver"
      >
        {paused ? <Play aria-hidden size={14} strokeWidth={1.25} /> : <Pause aria-hidden size={14} strokeWidth={1.25} />}
        <span className="t-label text-silver">{paused ? "Play film" : "Pause film"}</span>
      </button>
    </>
  );
}
