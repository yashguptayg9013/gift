"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { EASE, MEDIA } from "@/lib/motion";

/**
 * The closing shot rises out of black as it scrolls in; the title
 * tightens from wide tracking into place.
 */
export function FinalMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        const q = gsap.utils.selector(root);
        gsap
          .timeline({
            defaults: { ease: EASE.none },
            scrollTrigger: { trigger: root.current, start: "top bottom", end: "top top", scrub: true },
          })
          .fromTo(q("[data-final-media]"), { scale: 1.25, yPercent: -8 }, { scale: 1, yPercent: 0 }, 0)
          .fromTo(q("[data-final-dark]"), { opacity: 0.95 }, { opacity: 0.1 }, 0);

        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: "top 30%", once: true } })
          .from(q("#final-title [data-word]"), { yPercent: 115, duration: 1.6, stagger: 0.1, ease: EASE.reveal })
          .from(q("#final-title"), { letterSpacing: "0.12em", duration: 2.4, ease: EASE.reveal }, 0)
          .from(q("[data-final-fade]"), { autoAlpha: 0, y: 14, duration: 1.2, stagger: 0.1, ease: EASE.soft }, 0.6);
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
