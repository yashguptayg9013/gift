"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { MEDIA } from "@/lib/motion";

/**
 * Canvas frame sequence synced to scroll.
 * - Loads frames lazily (only once the section is near), 4 at a time.
 * - Mobile uses every `mobileStep`-th frame.
 * - Draws the nearest loaded frame, at most once per animation frame.
 * - Reduced motion / failures: the first frame stays as a static poster.
 */
export function FrameSequence({
  frames,
  mobileStep,
  children,
}: {
  frames: string[];
  mobileStep: number;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const list = useRef<string[]>(frames);
  const target = useRef(0);

  const draw = (index: number) => {
    const cvs = canvas.current;
    const ctx = cvs?.getContext("2d");
    if (!cvs || !ctx) return;
    // Nearest frame that has finished loading.
    let img: HTMLImageElement | null = null;
    for (let d = 0; d < list.current.length && !img; d++) {
      img = images.current[index - d] ?? images.current[index + d] ?? null;
    }
    if (!img) return;
    const scale = Math.max(cvs.width / img.naturalWidth, cvs.height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(img, (cvs.width - w) / 2, (cvs.height - h) / 2, w, h);
  };

  useEffect(() => {
    const cvs = canvas.current;
    if (!cvs) return;
    const mobile = window.matchMedia(MEDIA.mobile).matches;
    list.current = mobile ? frames.filter((_, i) => i % Math.max(1, mobileStep) === 0) : frames;
    images.current = new Array(list.current.length).fill(null);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      cvs.width = Math.round(cvs.clientWidth * dpr);
      cvs.height = Math.round(cvs.clientHeight * dpr);
      draw(target.current);
    };
    resize();
    window.addEventListener("resize", resize);

    let cancelled = false;
    let next = 0;
    const load = (i: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (!cancelled) {
            images.current[i] = img;
            if (i === 0 || Math.abs(i - target.current) < 2) draw(target.current);
          }
          resolve();
        };
        img.onerror = () => resolve(); // skip missing frames
        img.src = list.current[i];
      });
    const worker = async () => {
      while (!cancelled && next < list.current.length) await load(next++);
    };

    // The poster frame loads immediately; the rest only when the section is near.
    void load(0);
    next = 1;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        if (!window.matchMedia(MEDIA.reduced).matches) for (let w = 0; w < 4; w++) void worker();
      },
      { rootMargin: "150% 0px" },
    );
    if (root.current) observer.observe(root.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [frames, mobileStep]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        let frame = 0;
        ScrollTrigger.create({
          trigger: root.current,
          start: "top top",
          end: "+=200%",
          pin: true,
          scrub: true,
          onUpdate: (self) => {
            target.current = Math.round(self.progress * (list.current.length - 1));
            if (!frame)
              frame = requestAnimationFrame(() => {
                frame = 0;
                draw(target.current);
              });
          },
        });
        return () => cancelAnimationFrame(frame);
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative h-[100svh] overflow-hidden">
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      {children}
    </div>
  );
}
