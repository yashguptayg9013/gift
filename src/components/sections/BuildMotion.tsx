"use client";

import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { EASE, MEDIA } from "@/lib/motion";

/**
 * Desktop: as each row crosses the middle of the screen, the sticky
 * panel cross-fades to its image and the other rows recede.
 * The active index is written straight to the DOM — no React renders
 * during scroll.
 */
export function BuildMotion({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`${MEDIA.desktop} and ${MEDIA.motion}`, () => {
        const rows = gsap.utils.toArray<HTMLElement>("[data-build-row]", root.current);
        const images = gsap.utils.toArray<HTMLElement>("[data-build-image]", root.current);
        const indexEl = root.current?.querySelector("[data-build-index]");
        let current = -1;

        const activate = (index: number) => {
          if (index === current) return;
          current = index;
          images.forEach((img, i) => {
            gsap.to(img, {
              opacity: i === index ? 1 : 0,
              scale: i === index ? 1 : 1.06,
              duration: 1.1,
              ease: EASE.reveal,
              overwrite: true,
            });
          });
          rows.forEach((row, i) => (row.style.opacity = i === index ? "1" : "0.35"));
          if (indexEl) indexEl.textContent = String(index + 1).padStart(2, "0");
        };

        rows.forEach((row, i) => {
          ScrollTrigger.create({
            trigger: row,
            start: "top 55%",
            end: "bottom 55%",
            onToggle: (self) => self.isActive && activate(i),
          });
        });
        activate(0);

        return () => rows.forEach((row) => (row.style.opacity = ""));
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
