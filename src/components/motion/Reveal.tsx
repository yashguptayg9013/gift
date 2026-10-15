"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { MEDIA } from "@/lib/motion";
import { createReveals } from "./reveals";

/**
 * Wrap server-rendered content to activate its data-reveal / data-parallax
 * attributes. Renders a plain div so layout is unchanged.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        if (root.current) createReveals(root.current);
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
