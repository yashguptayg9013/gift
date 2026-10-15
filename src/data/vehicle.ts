/**
 * Vehicle identity and specification.
 *
 * Rule: only enter what you have confirmed (registration papers, owner's
 * manual, or the car itself). Leave `value: null` and the site shows the
 * `placeholder` text instead of guessing.
 */

export type SpecField = {
  label: string;
  value: string | null;
  /** Shown, visibly marked as missing, while `value` is null. */
  placeholder: string;
  /** Optional fields are hidden entirely when empty and `hideWhenEmpty` is true. */
  hideWhenEmpty?: boolean;
};

export const vehicle = {
  make: "Hyundai",
  model: "i20",
  variant: "Sportz",
  transmission: "iMT",

  /** Short label used in the hero and corners of the site (kept as typed — "i20" keeps its lowercase i). */
  label: "HYUNDAI i20 / SPORTZ iMT",

  specs: [
    { label: "Model year", value: null, placeholder: "Add model year" },
    { label: "Variant", value: "Sportz", placeholder: "Add variant" },
    { label: "Transmission", value: "iMT", placeholder: "Add transmission" },
    { label: "Engine", value: null, placeholder: "Add engine" },
    { label: "Fuel type", value: null, placeholder: "Add fuel type" },
    { label: "Exterior color", value: null, placeholder: "Add exterior color" },
    { label: "Wheels & tires", value: null, placeholder: "Add wheel and tire size" },
    { label: "Audio", value: "Bose audio system", placeholder: "Add audio system" },
    { label: "Mileage", value: null, placeholder: "Add mileage (optional)" },
  ] satisfies SpecField[],

  /** Installed accessories, one per line. Leave empty to show a placeholder. */
  accessories: [] as string[],
};
