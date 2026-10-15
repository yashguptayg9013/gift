/**
 * Every photograph and video the story uses.
 *
 * Drop a file at the `src` path inside /public and it replaces the
 * placeholder automatically — no code changes needed. The extension
 * doesn't matter: a .jpg or .png with the same name also fills the slot.
 *
 * Tip: for full-screen scenes, ~2400px on the long edge looks sharpest.
 * The same file can be used in several slots — just repeat the `src`.
 */

import type { VehicleImage, VehicleVideo } from "./types";

export const hero: VehicleImage = {
  src: "/images/hero/hero-front.webp",
  alt: "A black Hyundai i20 from the front three-quarter at night, headlights on, city skyline behind",
  position: "50% 60%",
  mobilePosition: "62% 60%",
  placeholder: { art: "front", viewBox: "-160 10 1520 1080", fit: "meet" },
};

export const machine: VehicleImage = {
  src: "/images/exterior/exterior-rear-three-quarter.webp",
  alt: "The black i20 from the rear three-quarter, tail lights glowing",
  position: "55% 60%",
  mobilePosition: "60% 60%",
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
      alt: "The black i20 head-on, headlights on",
      position: "50% 60%",
      placeholder: { art: "front", viewBox: "-500 -20 2200 800", fit: "meet" },
    },
  },
  {
    title: "Side profile",
    note: "The full line, nose to tail",
    image: {
      src: "/images/exterior/exterior-side.webp",
      alt: "Side profile of the black i20 against a city skyline at dusk",
      position: "50% 65%",
      placeholder: { art: "side", viewBox: "-50 -20 1700 640", fit: "meet" },
    },
  },
  {
    title: "Rear",
    note: "The last impression",
    image: {
      src: "/images/exterior/exterior-rear.webp",
      alt: "The black i20 from directly behind, full-width tail light bar lit",
      position: "50% 55%",
      placeholder: { art: "rear", viewBox: "-500 -20 2200 800", fit: "meet" },
    },
  },
  {
    title: "Close-up",
    note: "Where light meets the surface",
    image: {
      src: "/images/details/detail-door-handle.webp",
      alt: "Close-up of the i20's door handle and glossy black paint",
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
      alt: "Close-up of the i20 headlight with its daytime running light on",
      placeholder: { art: "front", viewBox: "236 360 260 208" },
    },
  },
  {
    title: "Front grille",
    line: "Where the design sets its stance.",
    layout: "small-right",
    image: {
      src: "/images/details/detail-grille.webp",
      alt: "Close-up of the i20 front grille and badge",
      position: "40% 50%",
      placeholder: { art: "front", viewBox: "470 440 260 325" },
    },
  },
  {
    title: "Wheels",
    line: "The only part of the design that touches the road.",
    layout: "small-left",
    image: {
      src: "/images/details/detail-wheel.webp",
      alt: "Close-up of a two-tone i20 alloy wheel",
      placeholder: { art: "side", viewBox: "1076 290 208 260" },
    },
  },
  {
    title: "Rear lighting",
    line: "What stays in view as the car pulls away.",
    layout: "large-right",
    image: {
      src: "/images/details/detail-rear-light.webp",
      alt: "Close-up of the i20 tail light, lit red",
      placeholder: { art: "rear", viewBox: "236 360 290 232" },
    },
  },
  {
    title: "Side mirror",
    line: "A thin line of light along the edge.",
    layout: "large-left",
    image: {
      src: "/images/details/detail-side-mirror.webp",
      alt: "The i20 side mirror with its indicator strip lit",
      placeholder: { art: "side", viewBox: "560 200 160 128" },
    },
  },
  {
    title: "Roof antenna",
    line: "The final stroke of the silhouette.",
    layout: "small-right",
    image: {
      src: "/images/details/detail-roof-antenna.webp",
      alt: "The i20 shark-fin roof antenna",
      placeholder: { art: "side", viewBox: "1100 80 160 200" },
    },
  },
];

export const cockpit = {
  dashboard: {
    src: "/images/interior/interior-dashboard.webp",
    alt: "The i20 dashboard and steering wheel at night",
    position: "50% 50%",
    mobilePosition: "68% 50%",
    placeholder: { art: "interior", fit: "slice" },
  },
  steering: {
    src: "/images/interior/interior-dashboard.webp",
    alt: "The i20 steering wheel and instrument cluster",
    position: "72% 55%",
    mobilePosition: "72% 55%",
    placeholder: { art: "interior", viewBox: "250 360 540 540" },
  },
  seats: {
    src: "/images/interior/interior-front-seats.webp",
    alt: "The i20 front seats in dark fabric",
    placeholder: { art: "interior", viewBox: "800 290 520 325" },
  },
  speaker: {
    src: "/images/interior/interior-speaker.webp",
    alt: "A Bose speaker grille in the i20's door",
    placeholder: { art: "speaker", fit: "slice" },
  },
} satisfies Record<string, VehicleImage>;

export const drive: { image: VehicleImage; video: VehicleVideo } = {
  image: {
    src: "/images/exterior/exterior-side.webp",
    alt: "The black i20 in profile against a city skyline at dusk",
    position: "50% 60%",
    mobilePosition: "45% 60%",
    placeholder: { art: "road", fit: "slice" },
  },
  /** Optional. If /public/videos/drive.mp4 exists it replaces the still. */
  video: {
    src: "/videos/drive.mp4",
    label: "Footage of the i20 on the road",
    poster: {
      src: "/images/exterior/exterior-side.webp",
      alt: "The black i20 in profile against a city skyline at dusk",
      placeholder: { art: "road", fit: "slice" },
    },
  },
};

export const finalFrame: VehicleImage = {
  src: "/images/exterior/exterior-rear.webp",
  alt: "The black i20 from behind at night, tail light bar glowing",
  position: "50% 55%",
  placeholder: { art: "rear", viewBox: "-300 -160 1800 1040", fit: "meet" },
};

export const sequence = {
  dir: "/images/sequence",
  /** Use every Nth frame on small screens to save memory. */
  mobileStep: 2,
  headline: "One continuous take.",
  note: "A sequence of photographs, played by your scroll.",
};
