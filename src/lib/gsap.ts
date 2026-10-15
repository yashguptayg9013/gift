/**
 * Single registration point for GSAP plugins. Import gsap, ScrollTrigger
 * and useGSAP from here (client components only) so plugins are always
 * registered exactly once.
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  // Mobile browsers resize the viewport when the address bar hides —
  // ignoring that avoids pinned sections jumping mid-scroll.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export { gsap, ScrollTrigger, useGSAP };
