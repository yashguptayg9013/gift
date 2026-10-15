"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { EASE, MEDIA } from "@/lib/motion";

/** Words brighten from steel to white as they are read, tied to scroll. */
export function ManifestoMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        const words = gsap.utils.toArray<HTMLElement>("[data-word]", root.current);
        gsap.fromTo(
          words,
          { opacity: 0.12, yPercent: 18 },
          {
            opacity: 1,
            yPercent: 0,
            ease: EASE.none,
            stagger: 0.25,
            scrollTrigger: { trigger: root.current, start: "top 70%", end: "bottom 65%", scrub: 0.6 },
          },
        );
        gsap.fromTo(
          "[data-manifesto-line]",
          { xPercent: (i) => (i % 2 ? 4 : -4) },
          {
            xPercent: 0,
            ease: EASE.none,
            scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom 60%", scrub: true },
          },
        );
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
