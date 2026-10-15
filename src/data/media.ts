/**
 * Every photograph and video the story uses.
 *
 * Drop a file at the `src` path inside /public and it replaces the
 * placeholder automatically — no code changes needed. Paths are
 * expected locations, not claims that the files already exist.
 *
 * Tip: export photos as .webp (or .avif), ~2400px on the long edge for
 * full-screen images and ~1600px for the rest. Next.js generates the
 * responsive sizes.
 */

import type { VehicleImage, VehicleVideo } from "./types";

export const hero: VehicleImage = {
  src: "/images/hero/hero-front.webp",
  alt: "The Hyundai i20 photographed head-on at night, headlights on",
  position: "50% 55%",
  mobilePosition: "50% 50%",
  placeholder: { art: "front", viewBox: "-160 10 1520 1080", fit: "meet" },
};

export const machine: VehicleImage = {
  src: "/images/exterior/exterior-front-three-quarter.webp",
  alt: "The i20 from a low front three-quarter angle",
  position: "50% 55%",
  placeholder: { art: "side", viewBox: "-240 -170 2080 900", fit: "meet" },
};

/** The Silhouette sequence: shown in this order. */
export const silhouette: {
  title: string;
  note: string;
  image: VehicleImage;
}[] = [
  {
    title: "Front",
    note: "Face to face",
    image: {
      src: "/images/exterior/exterior-front.webp",
      alt: "Front view of the i20",
      placeholder: { art: "front", viewBox: "-500 -20 2200 800", fit: "meet" },
    },
  },
  {
    title: "Side profile",
    note: "The full line, nose to tail",
    image: {
      src: "/images/exterior/exterior-side.webp",
      alt: "Side profile of the i20",
      placeholder: { art: "side", viewBox: "-50 -20 1700 640", fit: "meet" },
    },
  },
  {
    title: "Rear",
    note: "The last impression",
    image: {
      src: "/images/exterior/exterior-rear.webp",
      alt: "Rear view of the i20",
      placeholder: { art: "rear", viewBox: "-500 -20 2200 800", fit: "meet" },
    },
  },
  {
    title: "Close-up",
    note: "Where light meets the surface",
    image: {
      src: "/images/details/detail-body-lines.webp",
      alt: "Close-up of the i20's body lines catching the light",
      placeholder: { art: "side", viewBox: "520 200 900 386", fit: "slice" },
    },
  },
];

export type DetailLayout = "large-left" | "small-right" | "wide" | "small-left" | "large-right";

/** The Details section, in reading order. */
export const details: {
  title: string;
  line: string;
  layout: DetailLayout;
  image: VehicleImage;
}[] = [
  {
    title: "Headlights",
    line: "The first signature to arrive, and the last to fade.",
    layout: "large-left",
    image: {
      src: "/images/details/detail-headlight.webp",
      alt: "Close-up of the i20 headlight",
      placeholder: { art: "front", viewBox: "236 360 260 208" },
    },
  },
  {
    title: "Front grille",
    line: "Where the design sets its stance.",
    layout: "small-right",
    image: {
      src: "/images/details/detail-grille.webp",
      alt: "Close-up of the i20 front grille",
      placeholder: { art: "front", viewBox: "470 440 260 325" },
    },
  },
  {
    title: "Body lines",
    line: "Light finds the edges and follows them.",
    layout: "wide",
    image: {
      src: "/images/details/detail-body-lines.webp",
      alt: "The i20's side body lines in low light",
      placeholder: { art: "side", viewBox: "440 200 1000 430" },
    },
  },
  {
    title: "Wheels",
    line: "The only part of the design that touches the road.",
    layout: "small-left",
    image: {
      src: "/images/details/detail-wheel.webp",
      alt: "Close-up of an i20 wheel",
      placeholder: { art: "side", viewBox: "1076 290 208 260" },
    },
  },
  {
    title: "Rear lighting",
    line: "What stays in view as the car pulls away.",
    layout: "large-right",
    image: {
      src: "/images/details/detail-rear-light.webp",
      alt: "Close-up of the i20 rear light",
      placeholder: { art: "rear", viewBox: "236 360 290 232" },
    },
  },
  {
    title: "Interior finishing",
    line: "The surfaces you touch on every drive.",
    layout: "wide",
    image: {
      src: "/images/details/detail-interior-finish.webp",
      alt: "Interior trim and finishing of the i20",
      placeholder: { art: "interior", viewBox: "780 290 820 351" },
    },
  },
];

export const cockpit = {
  dashboard: {
    src: "/images/interior/interior-dashboard.webp",
    alt: "The i20 dashboard seen from the rear seat",
    position: "50% 50%",
    placeholder: { art: "interior", fit: "slice" },
  },
  steering: {
    src: "/images/interior/interior-steering.webp",
    alt: "The i20 steering wheel",
    placeholder: { art: "interior", viewBox: "250 360 540 540" },
  },
  infotainment: {
    src: "/images/interior/interior-infotainment.webp",
    alt: "The i20 infotainment screen",
    placeholder: { art: "interior", viewBox: "800 290 520 325" },
  },
  speaker: {
    src: "/images/interior/interior-speaker.webp",
    alt: "A speaker grille of the i20's Bose audio system",
    placeholder: { art: "speaker", fit: "slice" },
  },
} satisfies Record<string, VehicleImage>;

export const drive: { image: VehicleImage; video: VehicleVideo } = {
  image: {
    src: "/images/exterior/drive-road.webp",
    alt: "The i20 on an open road at dusk",
    position: "50% 60%",
    placeholder: { art: "road", fit: "slice" },
  },
  /** Optional. If /public/videos/drive.mp4 exists it replaces the still. */
  video: {
    src: "/videos/drive.mp4",
    label: "Footage of the i20 on the road",
    poster: {
      src: "/images/exterior/drive-road.webp",
      alt: "The i20 on an open road at dusk",
      placeholder: { art: "road", fit: "slice" },
    },
  },
};

export const finalFrame: VehicleImage = {
  src: "/images/exterior/final-frame.webp",
  alt: "The i20 from behind at night, tail lights glowing",
  position: "50% 55%",
  placeholder: { art: "rear", viewBox: "-300 -160 1800 1040", fit: "meet" },
};

/**
 * Optional scroll-controlled frame sequence.
 * Put consistently shot frames in /public/images/sequence named
 * frame-0001.webp, frame-0002.webp … (same framing, same size).
 * The section only appears when frames exist.
 */
export const sequence = {
  dir: "/images/sequence",
  /** Use every Nth frame on small screens to save memory. */
  mobileStep: 2,
  headline: "One continuous take.",
  note: "A sequence of photographs, played by your scroll.",
};
