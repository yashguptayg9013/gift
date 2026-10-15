/**
 * Gallery frames, in order. `layout` controls the editorial grid:
 *   "full"  — edge-to-edge, cinematic 21:9
 *   "wide"  — 7 of 12 columns, 3:2
 *   "tall"  — 5 of 12 columns, 4:5
 *   "half"  — 6 of 12 columns, 1:1
 */

import type { VehicleImage } from "./types";

export type GalleryLayout = "full" | "wide" | "tall" | "half";

export type GalleryItem = {
  caption: string;
  layout: GalleryLayout;
  image: VehicleImage;
};

export const gallery: GalleryItem[] = [
  {
    caption: "Night, front three-quarter",
    layout: "full",
    image: {
      src: "/images/hero/hero-front.webp",
      alt: "A black Hyundai i20 from the front three-quarter at night",
      position: "50% 62%",
      placeholder: { art: "side", viewBox: "-60 20 1720 737" },
    },
  },
  {
    caption: "Tail light, lit",
    layout: "tall",
    image: {
      src: "/images/details/detail-rear-light.webp",
      alt: "Close-up of the i20 tail light",
      placeholder: { art: "rear", viewBox: "236 340 240 300" },
    },
  },
  {
    caption: "Rear three-quarter",
    layout: "wide",
    image: {
      src: "/images/exterior/exterior-rear-three-quarter.webp",
      alt: "The i20 from the rear three-quarter at night",
      position: "50% 60%",
      placeholder: { art: "rear", viewBox: "100 40 1000 667" },
    },
  },
  {
    caption: "Side mirror",
    layout: "half",
    image: {
      src: "/images/details/detail-side-mirror.webp",
      alt: "The i20 side mirror with its indicator strip lit",
      placeholder: { art: "side", viewBox: "520 180 260 260" },
    },
  },
  {
    caption: "Rear bumper",
    layout: "half",
    image: {
      src: "/images/details/detail-rear-bumper.webp",
      alt: "The i20 rear bumper and reflector",
      placeholder: { art: "rear", viewBox: "250 520 300 300" },
    },
  },
  {
    caption: "Profile at dusk",
    layout: "full",
    image: {
      src: "/images/exterior/exterior-side.webp",
      alt: "Side profile of the i20 against the city at dusk",
      position: "50% 65%",
      placeholder: { art: "side", viewBox: "0 60 1600 686" },
    },
  },
  {
    caption: "The rear cabin",
    layout: "wide",
    image: {
      src: "/images/interior/interior-rear-seats.webp",
      alt: "The i20 rear seats",
      position: "50% 55%",
      placeholder: { art: "interior", viewBox: "150 150 900 600" },
    },
  },
  {
    caption: "Front grille",
    layout: "tall",
    image: {
      src: "/images/details/detail-grille.webp",
      alt: "The i20 front grille and badge",
      position: "40% 50%",
      placeholder: { art: "front", viewBox: "470 440 260 325" },
    },
  },
  {
    caption: "Roof antenna",
    layout: "half",
    image: {
      src: "/images/details/detail-roof-antenna.webp",
      alt: "The i20 shark-fin roof antenna",
      placeholder: { art: "side", viewBox: "1060 60 240 240" },
    },
  },
  {
    caption: "Head-on",
    layout: "half",
    image: {
      src: "/images/exterior/exterior-front.webp",
      alt: "The i20 head-on at night",
      position: "50% 55%",
      placeholder: { art: "front", viewBox: "100 60 1000 1000" },
    },
  },
];
