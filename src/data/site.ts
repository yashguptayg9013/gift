/**
 * Site-wide copy and settings.
 * Edit the words here — section components read from this file.
 */

export const site = {
  projectName: "i20 AFTER DARK",
  title: "HYUNDAI i20 — A CINEMATIC EXPERIENCE",
  description:
    "A personal, cinematic portrait of a Hyundai i20 Sportz iMT. An independent owner project — not affiliated with Hyundai.",
  /** Used for metadata. Set NEXT_PUBLIC_SITE_URL in Vercel once you have a domain. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  /**
   * Shows a small dashed tag with the expected file path on every
   * placeholder illustration. Set to false once your photos are in.
   */
  showPlaceholderLabels: true,

  /** Primary navigation (desktop + mobile). */
  nav: [
    { label: "The Car", href: "#the-car" },
    { label: "The Cockpit", href: "#the-cockpit" },
    { label: "Details", href: "#details" },
    { label: "Gallery", href: "#gallery" },
  ],
  /** Extra links shown only in the mobile menu. */
  navExtra: [
    { label: "The Build", href: "#the-build" },
    { label: "Specification", href: "#specification" },
  ],

  copy: {
    hero: {
      chapter: "Ch. 01 — The Opening",
      headline: "Built to move.",
      supporting: "A different perspective on the everyday drive.",
      tagline: "A cinematic experience",
    },
    manifesto: [
      "Designed for the moment.",
      "Engineered for the experience.",
      "Every detail matters.",
    ],
    machine: {
      chapter: "02 — The Machine",
      view: "Rear three-quarter",
      headline: "More than the\ndaily drive.",
      supporting: "A familiar silhouette, experienced from a different perspective.",
    },
    silhouette: {
      chapter: "03 — The Silhouette",
      headline: "Form in motion.",
      supporting:
        "Four fixed points of view. Separate photographs, read one after another — like frames on a contact sheet.",
    },
    details: {
      chapter: "04 — The Details",
      headline: "Every detail\nhas a purpose.",
      supporting:
        "Up close, the car stops being an object and becomes a set of decisions — edges, surfaces, light.",
    },
    cockpit: {
      chapter: "05 — The Cockpit",
      headline: "Your world.\nYour sound.",
      supporting: "The details that make every drive personal.",
      steering: { title: "Steering wheel", line: "Where every drive begins." },
      seats: { title: "Front seats", line: "Where every drive is felt." },
    },
    audio: {
      /** Set to false to hide the audio section entirely. */
      enabled: true,
      eyebrow: "Bose audio system",
      headline: "The soundtrack\nto every drive.",
      body: "Music changes how a familiar road feels. This is the part of the cabin you hear before you notice anything else.",
      visualNote:
        "Decorative visualization. It does not measure or represent the car's audio output.",
      demoNote:
        "Website demo: a soft tone generated in your browser. It is not a recording of the car's audio system.",
    },
    drive: {
      chapter: "06 — The Drive",
      lines: ["The city, after hours.", "The long way home."],
      headline: "Made for\nthe journey.",
      supporting: "No destination required. Just the road, the light, and the time in between.",
    },
    build: {
      chapter: "07 — The Build",
      headline: "The build.",
      supporting:
        "A running record of what is original, what has changed, and what comes next.",
    },
    specification: {
      chapter: "08 — Specification",
      headline: "On record.",
      supporting:
        "Owner-supplied details only. Anything not yet confirmed is left open rather than guessed.",
    },
    gallery: {
      chapter: "09 — Gallery",
      headline: "The stills.",
      supporting: "Select any frame to view it full screen.",
    },
    final: {
      chapter: "10 — Final Frame",
      headline: "The drive\nnever ends.",
      replay: "Replay experience",
    },
    footer: {
      disclaimer:
        "i20 AFTER DARK is an independent, non-commercial owner project. It is not affiliated with, endorsed by, or sponsored by Hyundai Motor Company. Hyundai, i20 and Bose are trademarks of their respective owners. All vehicle information is owner-supplied.",
    },
  },
} as const;

export type NavItem = { label: string; href: string };
