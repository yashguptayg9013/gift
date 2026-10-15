"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { MEDIA } from "@/lib/motion";

const INTERACTIVE = "a, button, [role='button'], input, label, summary";

/**
 * A quiet trailing ring for mouse users. The native cursor stays
 * visible; the ring never receives pointer events. Not rendered on
 * touch devices or with reduced motion.
 */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    if (!window.matchMedia(`${MEDIA.finePointer} and ${MEDIA.motion}`).matches) return;

    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
    let visible = false;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!visible) {
        gsap.set(el, { x: event.clientX, y: event.clientY });
        gsap.to(el, { autoAlpha: 1, duration: 0.3 });
        visible = true;
      }
      xTo(event.clientX);
      yTo(event.clientY);
      const target = event.target instanceof Element ? event.target : null;
      el.classList.toggle("is-active", Boolean(target?.closest(INTERACTIVE)));
    };
    const onLeave = () => {
      visible = false;
      gsap.to(el, { autoAlpha: 0, duration: 0.3 });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
    };
  }, []);

  return (
    <div
      ref={ring}
      aria-hidden
      className="cursor-ring pointer-events-none fixed left-0 top-0 z-[75] -ml-[18px] -mt-[18px] h-9 w-9 rounded-full border border-silver/40 opacity-0 invisible"
    />
  );
}
