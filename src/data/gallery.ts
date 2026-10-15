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
      src: "/images/gallery/gallery-01.webp",
      alt: "The i20 at night from the front three-quarter",
      placeholder: { art: "side", viewBox: "-60 20 1720 737" },
    },
  },
  {
    caption: "Headlight detail",
    layout: "tall",
    image: {
      src: "/images/gallery/gallery-02.webp",
      alt: "Headlight detail",
      placeholder: { art: "front", viewBox: "236 340 240 300" },
    },
  },
  {
    caption: "Side profile, low angle",
    layout: "wide",
    image: {
      src: "/images/gallery/gallery-03.webp",
      alt: "Side profile from a low angle",
      placeholder: { art: "side", viewBox: "100 40 1400 933" },
    },
  },
  {
    caption: "The cockpit",
    layout: "half",
    image: {
      src: "/images/gallery/gallery-04.webp",
      alt: "The i20 cockpit",
      placeholder: { art: "interior", viewBox: "150 150 900 900" },
    },
  },
  {
    caption: "Rear, tail lights on",
    layout: "half",
    image: {
      src: "/images/gallery/gallery-05.webp",
      alt: "Rear of the i20 with tail lights on",
      placeholder: { art: "rear", viewBox: "100 60 1000 1000" },
    },
  },
  {
    caption: "Open road",
    layout: "full",
    image: {
      src: "/images/gallery/gallery-06.webp",
      alt: "The i20 on an open road",
      placeholder: { art: "road", viewBox: "0 200 1600 686" },
    },
  },
  {
    caption: "Wheel, in motion blur",
    layout: "wide",
    image: {
      src: "/images/gallery/gallery-07.webp",
      alt: "Wheel detail",
      placeholder: { art: "side", viewBox: "980 260 400 267" },
    },
  },
  {
    caption: "Speaker grille",
    layout: "tall",
    image: {
      src: "/images/gallery/gallery-08.webp",
      alt: "Speaker grille detail",
      placeholder: { art: "speaker", viewBox: "160 100 480 600" },
    },
  },
];
