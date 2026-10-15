"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { EASE, MEDIA } from "@/lib/motion";
import { createReveals } from "@/components/motion/reveals";

export function SilhouetteMotion({ children, count }: { children: ReactNode; count: number }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add({ motion: MEDIA.motion, desktop: MEDIA.desktop }, (ctx) => {
        const { motion, desktop } = ctx.conditions as Record<string, boolean>;
        if (!motion || !root.current) return;

        createReveals(root.current);
        const q = gsap.utils.selector(root);
        const frames = q("[data-sil-frame]");
        const media = q("[data-sil-media]");
        const bars = q("[data-sil-bar]");

        if (!desktop) {
          // Mobile: each view wipes in as it arrives.
          frames.forEach((frame, i) => {
            gsap
              .timeline({ scrollTrigger: { trigger: frame, start: "top 85%", once: true } })
              .from(frame, { clipPath: "inset(0% 0% 0% 100%)", duration: 1.4, ease: EASE.cinema })
              .from(media[i], { scale: 1.2, duration: 1.8, ease: EASE.reveal }, 0.1);
          });
          return;
        }

        // Switch from the readable grid to the stacked, pinned stage.
        root.current.classList.add("sil-pinned");
        const indexEl = q("[data-sil-index]")[0];
        let shown = 0;

        gsap.set(frames.slice(1), { clipPath: "inset(0% 0% 0% 100%)" });
        gsap.set(bars, { scaleX: 0 });
        gsap.set(bars[0], { scaleX: 1 });

        const tl = gsap.timeline({
          defaults: { ease: EASE.none },
          scrollTrigger: {
            trigger: q("[data-sil-stage]")[0],
            start: "top top",
            end: () => `+=${(count - 1) * window.innerHeight * 0.9}`,
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const index = Math.min(count - 1, Math.floor(self.progress * (count - 1) + 0.5));
              if (index !== shown && indexEl) {
                shown = index;
                indexEl.textContent = String(index + 1).padStart(2, "0");
              }
            },
          },
        });

        for (let i = 1; i < count; i++) {
          const at = i - 1;
          tl.to(frames[i], { clipPath: "inset(0% 0% 0% 0%)", duration: 1, ease: "power2.inOut" }, at)
            .fromTo(media[i], { scale: 1.18, xPercent: 6 }, { scale: 1, xPercent: 0, duration: 1, ease: "power2.out" }, at)
            .to(media[i - 1], { scale: 1.06, xPercent: -6, opacity: 0.35, duration: 1, ease: "power2.inOut" }, at)
            .to(bars[i], { scaleX: 1, duration: 1 }, at);
        }

        const el = root.current;
        return () => el.classList.remove("sil-pinned");
      });
    },
    { scope: root, dependencies: [count] },
  );

  return <div ref={root}>{children}</div>;
}
