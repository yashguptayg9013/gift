/**
 * Thin wrapper around the Lenis instance so any component can scroll
 * smoothly without importing Lenis directly. Falls back to native
 * scrolling when Lenis is not running (reduced motion, or JS failure).
 */

import type Lenis from "lenis";
import { prefersReducedMotion } from "./motion";

let lenis: Lenis | null = null;

export function setLenis(instance: Lenis | null) {
  lenis = instance;
}

export function getLenis() {
  return lenis;
}

type ScrollOptions = {
  immediate?: boolean;
  /** Move keyboard focus to the target once the scroll lands. */
  focus?: boolean;
  onComplete?: () => void;
};

export function scrollToTarget(target: string | HTMLElement | number, options: ScrollOptions = {}) {
  const element =
    typeof target === "string" ? document.querySelector<HTMLElement>(target) : typeof target === "number" ? null : target;
  if (typeof target === "string" && !element) return;

  const finish = () => {
    if (options.focus && element) element.focus({ preventScroll: true });
    options.onComplete?.();
  };

  const immediate = options.immediate || prefersReducedMotion();

  if (lenis) {
    lenis.scrollTo(element ?? (target as number), {
      immediate,
      duration: 1.8,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
      force: true,
      onComplete: finish,
    });
    if (immediate) finish();
    return;
  }

  const top = element ? element.getBoundingClientRect().top + window.scrollY : (target as number);
  window.scrollTo({ top, behavior: immediate ? "auto" : "smooth" });
  finish();
}

/** Freeze page scrolling while an overlay (menu, lightbox) is open. */
export function lockScroll(locked: boolean) {
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
  }
  document.documentElement.style.overflow = locked ? "hidden" : "";
}
