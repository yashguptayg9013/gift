/**
 * THE BUILD — the modification log.
 *
 * Each entry needs a name, description, image and status.
 * `date` and `details` are optional. Do not list a change as
 * "Installed" unless it is actually on the car.
 *
 * Entries marked `placeholder: true` are clearly labelled on the
 * site as awaiting your information. Replace or delete them.
 */

import type { VehicleImage } from "./types";

export type ModStatus = "Installed" | "Planned" | "Stock";

export type Modification = {
  category: string;
  name: string;
  description: string;
  image: VehicleImage;
  /** Leave undefined until confirmed — the site shows "Status to confirm". */
  status?: ModStatus;
  /** Free text, e.g. "March 2025". */
  date?: string;
  /** Extra lines, e.g. part numbers or notes you have verified. */
  details?: string[];
  placeholder?: boolean;
};

export const modifications: Modification[] = [
  {
    category: "Exterior",
    name: "Exterior changes",
    description: "Describe any exterior changes here — or note that the bodywork is as delivered.",
    image: {
      src: "/images/exterior/exterior-rear-three-quarter.webp",
      alt: "Exterior of the black i20 at night",
      placeholder: { art: "side", viewBox: "120 60 1300 540" },
    },
    placeholder: true,
  },
  {
    category: "Wheels & tires",
    name: "Wheels and tires",
    description: "Add the wheel and tire setup, and whether it is original or upgraded.",
    image: {
      src: "/images/details/detail-wheel.webp",
      alt: "Wheel and tire of the i20",
      placeholder: { art: "side", viewBox: "1060 290 240 300" },
    },
    placeholder: true,
  },
  {
    category: "Audio",
    name: "Audio",
    description: "Note the audio setup and anything added or changed.",
    image: {
      src: "/images/interior/interior-speaker.webp",
      alt: "Bose speaker grille in the i20",
      placeholder: { art: "speaker" },
    },
    placeholder: true,
  },
  {
    category: "Sound damping",
    name: "Sound damping",
    description: "Record any damping work — where it was applied and when.",
    image: {
      src: "/images/modifications/modification-damping.webp",
      alt: "Sound damping material inside a door panel",
      placeholder: { art: "interior", viewBox: "0 360 760 950" },
    },
    placeholder: true,
  },
  {
    category: "Interior",
    name: "Interior accessories",
    description: "List interior accessories such as mats, covers or organizers.",
    image: {
      src: "/images/interior/interior-front-seats.webp",
      alt: "The i20 front seats",
      placeholder: { art: "interior", viewBox: "400 200 900 1125" },
    },
    placeholder: true,
  },
  {
    category: "Lighting",
    name: "Lighting",
    description: "Describe any lighting changes, or confirm the lighting is original.",
    image: {
      src: "/images/details/detail-headlight.webp",
      alt: "The i20 headlight",
      placeholder: { art: "front", viewBox: "236 340 300 375" },
    },
    placeholder: true,
  },
  {
    category: "Next",
    name: "Future modifications",
    description: "Ideas under consideration. Mark them Planned once you commit to them.",
    image: {
      src: "/images/exterior/exterior-front.webp",
      alt: "The i20 front end",
      placeholder: { art: "front", viewBox: "200 200 800 1000" },
    },
    placeholder: true,
  },
];
