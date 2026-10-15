"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { REPLAY_EVENT } from "@/lib/experience";
import { EASE, MEDIA } from "@/lib/motion";

/**
 * Choreographs the opening:
 *   black → technical type → a beam of light sweeps the frame, uncovering
 *   the car → the camera settles → title rises → scroll cue.
 * Then, on scroll, the camera pushes in and the frame fades to black,
 * handing over to the next scene.
 */
export function HeroMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MEDIA.reduced, () => {
        document.documentElement.classList.add("intro-ready");
      });

      mm.add({ motion: MEDIA.motion, desktop: MEDIA.desktop, fine: MEDIA.finePointer }, (ctx) => {
        const { motion, desktop, fine } = ctx.conditions as Record<string, boolean>;
        if (!motion) return;

        const q = gsap.utils.selector(root);
        const curtain = q("[data-hero-curtain]");
        const camera = q("[data-hero-camera]");
        const reveal = q("[data-hero-reveal]");
        const dark = q("[data-hero-dark]");
        const beam = q("[data-hero-beam]");
        const corners = q("[data-hero-corner]");
        const labels = q("[data-hero-label]");
        const words = q("#hero-title [data-word]");
        const sub = q("[data-hero-sub]");
        const cue = q("[data-hero-cue]");

        // Starting state: almost black.
        gsap.set(curtain, { autoAlpha: 1 });
        gsap.set(camera, { scale: 1.16, xPercent: desktop ? -2 : 0 });
        gsap.set(reveal, { "--reveal": "-20%" });
        gsap.set(dark, { opacity: 0.9 });
        gsap.set(beam, { xPercent: -130, skewX: -14 });
        gsap.set(corners, { autoAlpha: 0, scale: 0.4 });
        gsap.set(labels, { autoAlpha: 0, y: 10 });
        gsap.set(words, { yPercent: 115 });
        gsap.set(sub, { autoAlpha: 0, y: 18 });
        gsap.set(cue, { autoAlpha: 0 });
        gsap.set("[data-intro]", { visibility: "visible" });
        gsap.set([sub, labels, cue, corners], { visibility: "hidden" });
        document.documentElement.classList.add("intro-ready");

        const beamTravel = () => (window.innerWidth / (beam[0]?.offsetWidth || 1)) * 100 + 160;
        // The car is uncovered exactly where the beam has passed: a soft
        // mask edge follows the beam's live position.
        const trackBeam = () => {
          const b = beam[0]?.getBoundingClientRect();
          const r = reveal[0]?.getBoundingClientRect();
          if (!b || !r) return;
          const pct = ((b.left + b.width * 0.35 - r.left) / r.width) * 100;
          reveal[0].style.setProperty("--reveal", `${pct.toFixed(2)}%`);
        };

        const tl = gsap.timeline({ defaults: { ease: EASE.reveal } });
        tl.to(curtain, { autoAlpha: 0, duration: 1.4, ease: EASE.inOut }, 0)
          .to(labels, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.12, ease: EASE.soft }, 0.5)
          .to(corners, { autoAlpha: 1, scale: 1, duration: 1.1, stagger: 0.06 }, 0.7)
          // The beam crosses the frame; the car is uncovered in its wake.
          .to(beam, { xPercent: beamTravel, duration: 2.1, ease: "power2.inOut", onUpdate: trackBeam }, 1.0)
          .set(reveal, { "--reveal": "200%" })
          .to(dark, { opacity: 0.55, duration: 1.2, ease: EASE.soft }, 1.3)
          .to(dark, { opacity: 0.12, duration: 2.4, ease: EASE.inOut }, 2.5)
          // Camera settles — a slow dolly back into position.
          .to(camera, { scale: 1, xPercent: 0, duration: 4.6, ease: "power3.out" }, 1.0)
          .to(words, { yPercent: 0, duration: 1.4, stagger: 0.1 }, 2.7)
          .to(sub, { autoAlpha: 1, y: 0, duration: 1.1, ease: EASE.soft }, 3.25)
          .to(cue, { autoAlpha: 1, duration: 0.9, ease: EASE.soft }, 3.7);

        // Impatient visitors: any scroll or key input fast-forwards the intro.
        const hurry = () => {
          if (tl.isActive()) tl.timeScale(3.5);
        };
        window.addEventListener("wheel", hurry, { passive: true });
        window.addEventListener("touchmove", hurry, { passive: true });
        window.addEventListener("keydown", hurry);

        const onReplay = () => tl.timeScale(1).restart();
        window.addEventListener(REPLAY_EVENT, onReplay);

        // Scroll-out: camera pushes in, title lifts away, frame darkens.
        const out = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
        out
          .to(q("[data-hero-scene]"), { scale: 1.12, yPercent: 10, ease: EASE.none }, 0)
          .to(q("[data-hero-content]"), { yPercent: -18, autoAlpha: 0, ease: EASE.none }, 0)
          .to(q("[data-hero-exit]"), { opacity: 1, ease: EASE.none }, 0);

        // Subtle parallax against the pointer — desktop mouse only.
        let onPointer: ((e: PointerEvent) => void) | undefined;
        if (fine) {
          const drift = q("[data-hero-drift]");
          const xTo = gsap.quickTo(drift, "x", { duration: 1.6, ease: "power3" });
          const yTo = gsap.quickTo(drift, "y", { duration: 1.6, ease: "power3" });
          onPointer = (e: PointerEvent) => {
            xTo((e.clientX / window.innerWidth - 0.5) * -18);
            yTo((e.clientY / window.innerHeight - 0.5) * -10);
          };
          window.addEventListener("pointermove", onPointer, { passive: true });
        }

        return () => {
          window.removeEventListener("wheel", hurry);
          window.removeEventListener("touchmove", hurry);
          window.removeEventListener("keydown", hurry);
          window.removeEventListener(REPLAY_EVENT, onReplay);
          if (onPointer) window.removeEventListener("pointermove", onPointer);
        };
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="absolute inset-0">
      {children}
      <div data-hero-exit aria-hidden className="pointer-events-none absolute inset-0 bg-obsidian opacity-0" />
      <div data-hero-curtain aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-obsidian opacity-0" />
    </div>
  );
}
