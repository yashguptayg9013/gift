/**
 * Motion tokens. Every timeline in the site pulls its easing and
 * timing from here so the film keeps one rhythm.
 */

export const EASE = {
  /** Slow-in, slow-out. Camera moves and wipes. */
  cinema: "power4.inOut",
  /** Fast start, long settle. Text and image reveals. */
  reveal: "expo.out",
  /** Gentle UI movement. */
  soft: "power3.out",
  inOut: "power2.inOut",
  none: "none",
} as const;

export const DURATION = {
  fast: 0.45,
  base: 0.9,
  slow: 1.4,
  cinematic: 2.2,
} as const;

export const STAGGER = {
  words: 0.08,
  items: 0.12,
} as const;

export const MEDIA = {
  motion: "(prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
  desktop: "(min-width: 768px)",
  mobile: "(max-width: 767px)",
  finePointer: "(hover: hover) and (pointer: fine)",
} as const;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(MEDIA.reduced).matches;
}
