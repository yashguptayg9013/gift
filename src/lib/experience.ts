/**
 * "Replay experience": cut to black, return to the top, and run the
 * opening sequence again.
 */

import { gsap } from "./gsap";
import { prefersReducedMotion } from "./motion";
import { scrollToTarget } from "./scroll";

export const REPLAY_EVENT = "i20:replay";

export function replayExperience() {
  const curtain = document.querySelector<HTMLElement>("[data-curtain]");
  const restart = () => {
    scrollToTarget(0, { immediate: true });
    window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
    document.getElementById("top")?.focus({ preventScroll: true });
  };

  if (!curtain || prefersReducedMotion()) {
    restart();
    return;
  }

  gsap.to(curtain, {
    autoAlpha: 1,
    duration: 0.9,
    ease: "power2.inOut",
    onComplete: () => {
      restart();
      // The hero starts on black, so lifting the curtain is invisible.
      gsap.to(curtain, { autoAlpha: 0, duration: 0.3, delay: 0.15 });
    },
  });
}
