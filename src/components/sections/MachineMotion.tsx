"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { EASE, MEDIA } from "@/lib/motion";

/**
 * Desktop: the stage pins while a small window opens to full screen,
 * the camera tracks sideways, and the title rises — all on scroll.
 * Mobile: same idea without pinning, so scrolling stays natural.
 */
export function MachineMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add({ motion: MEDIA.motion, desktop: MEDIA.desktop }, (ctx) => {
        const { motion, desktop } = ctx.conditions as Record<string, boolean>;
        if (!motion) return;

        const q = gsap.utils.selector(root);
        const stage = q("[data-machine-stage]")[0];
        const words = q("#machine-title [data-word]");
        const supporting = [...q("[data-machine-copy]"), ...q("[data-reveal='fade']"), ...q("[data-machine-label]")];

        if (desktop) {
          const tl = gsap.timeline({
            defaults: { ease: EASE.none },
            scrollTrigger: { trigger: stage, start: "top top", end: "+=160%", scrub: 1, pin: true, anticipatePin: 1 },
          });
          tl.fromTo(
            q("[data-machine-frame]"),
            { clipPath: "inset(20% 27% 20% 27%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power2.inOut" },
            0,
          )
            .fromTo(q("[data-machine-image]"), { scale: 1.3, xPercent: 4 }, { scale: 1.04, xPercent: -3, duration: 1 }, 0)
            .fromTo(q("[data-machine-light]"), { xPercent: -20, opacity: 0.4 }, { xPercent: 20, opacity: 1, duration: 1 }, 0)
            .from(words, { yPercent: 115, duration: 0.3, stagger: 0.05, ease: "power3.out" }, 0.42)
            .from(q("[data-machine-rule]"), { scaleX: 0, duration: 0.3, ease: "power2.out" }, 0.55)
            .from(supporting, { autoAlpha: 0, y: 20, duration: 0.25, stagger: 0.05, ease: "power2.out" }, 0.6)
            .to({}, { duration: 0.15 });
        } else {
          gsap.fromTo(
            q("[data-machine-frame]"),
            { clipPath: "inset(12% 8% 12% 8%)" },
            {
              clipPath: "inset(0% 0% 0% 0%)",
              ease: EASE.none,
              scrollTrigger: { trigger: stage, start: "top bottom", end: "top top", scrub: true },
            },
          );
          gsap.fromTo(
            q("[data-machine-image]"),
            { scale: 1.25 },
            { scale: 1.02, ease: EASE.none, scrollTrigger: { trigger: stage, start: "top bottom", end: "bottom top", scrub: true } },
          );
          const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: "top 35%", once: true } });
          tl.from(words, { yPercent: 115, duration: 1.3, stagger: 0.08, ease: EASE.reveal })
            .from(q("[data-machine-rule]"), { scaleX: 0, duration: 1.2, ease: EASE.reveal }, 0.3)
            .from(supporting, { autoAlpha: 0, y: 20, duration: 1, stagger: 0.08, ease: EASE.soft }, 0.4);
        }
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
