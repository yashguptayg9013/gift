"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/** A 1px line along the top edge that fills with page progress. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const setScale = gsap.quickSetter(bar.current, "scaleX");
    setScale(0);
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => setScale(self.progress),
    });
  });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-px bg-white/[0.06]">
      <div ref={bar} className="h-full origin-left bg-crimson" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
