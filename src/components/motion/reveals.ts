/**
 * Shared scroll reveals driven by data attributes, so server-rendered
 * markup can opt into motion without becoming a client component:
 *
 *   data-reveal="fade"   — rise and fade in
 *   data-reveal="words"  — masked word-by-word rise (use <SplitWords />)
 *   data-reveal="mask"   — image wipes up through a mask; an inner
 *                          [data-reveal-inner] settles from a zoom
 *   data-reveal="line"   — hairline draws from the left
 *   data-parallax="8"    — drifts ±8% on scroll
 *   data-zoom            — settles from a slight zoom as it scrolls past
 *                          (data-zoom="section" spans the whole section)
 *
 * Call inside a gsap.context / useGSAP so everything is cleaned up.
 * Callers only run this when reduced motion is NOT requested.
 */

import { gsap, ScrollTrigger } from "@/lib/gsap";
import { DURATION, EASE, STAGGER } from "@/lib/motion";

const START = "top 86%";

export function createReveals(root: Element) {
  const q = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T & Element>(sel));

  q("[data-reveal='fade']").forEach((el) => {
    gsap.from(el, {
      autoAlpha: 0,
      y: 28,
      duration: DURATION.slow,
      ease: EASE.reveal,
      scrollTrigger: { trigger: el, start: START, once: true },
    });
  });

  q("[data-reveal='words']").forEach((el) => {
    const words = el.querySelectorAll("[data-word]");
    gsap.from(words, {
      yPercent: 115,
      duration: DURATION.slow,
      ease: EASE.reveal,
      stagger: STAGGER.words,
      scrollTrigger: { trigger: el, start: START, once: true },
    });
  });

  q("[data-reveal='mask']").forEach((el) => {
    const inner = el.querySelector("[data-reveal-inner]");
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    tl.from(el, { clipPath: "inset(100% 0% 0% 0%)", duration: DURATION.cinematic * 0.8, ease: EASE.cinema });
    if (inner) tl.from(inner, { scale: 1.28, duration: DURATION.cinematic, ease: EASE.reveal }, 0.1);
  });

  q("[data-reveal='line']").forEach((el) => {
    gsap.from(el, {
      scaleX: 0,
      transformOrigin: "left center",
      duration: DURATION.cinematic,
      ease: EASE.reveal,
      scrollTrigger: { trigger: el, start: START, once: true },
    });
  });

  q("[data-zoom]").forEach((el) => {
    const trigger = el.getAttribute("data-zoom") === "section" ? el.closest("section") : el.parentElement;
    gsap.fromTo(
      el,
      { scale: 1.18, xPercent: 0 },
      {
        scale: 1,
        ease: EASE.none,
        scrollTrigger: { trigger: trigger ?? el, start: "top bottom", end: "bottom top", scrub: true },
      },
    );
  });

  q("[data-parallax]").forEach((el) => {
    const amount = Number(el.getAttribute("data-parallax")) || 6;
    gsap.fromTo(
      el,
      { yPercent: -amount },
      {
        yPercent: amount,
        ease: EASE.none,
        scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true },
      },
    );
  });
}

export { ScrollTrigger };
