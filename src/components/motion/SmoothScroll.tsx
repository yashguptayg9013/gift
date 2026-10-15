"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { MEDIA } from "@/lib/motion";
import { setLenis } from "@/lib/scroll";

/**
 * Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger and
 * Lenis share one animation frame. Disabled for reduced motion; touch
 * devices keep native scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia(MEDIA.reduced).matches) return;

    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, autoRaf: false });
    setLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  useEffect(() => {
    // Web fonts change text metrics; re-measure trigger positions once loaded.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) ScrollTrigger.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
