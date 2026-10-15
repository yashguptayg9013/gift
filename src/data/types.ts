/**
 * Shared types for the editable data files in this folder.
 */

/** Line-art studies used while a real photograph is missing. */
export type PlaceholderArt =
  | "front"
  | "side"
  | "rear"
  | "interior"
  | "speaker"
  | "road";

export type VehicleImage = {
  /** Path inside /public, e.g. "/images/hero/hero-front.webp". */
  src: string;
  /** Describe what is actually in the photograph. */
  alt: string;
  /** CSS object-position for desktop crops, e.g. "50% 60%". */
  position?: string;
  /** CSS object-position for mobile crops. Falls back to `position`. */
  mobilePosition?: string;
  /** How to draw the placeholder until the photograph exists. */
  placeholder: {
    art: PlaceholderArt;
    /** Crop into the line drawing (SVG viewBox). */
    viewBox?: string;
    /** "slice" fills the frame, "meet" shows the whole drawing. */
    fit?: "slice" | "meet";
  };
};

/** A VehicleImage after the server has checked whether the file exists. */
export type ResolvedImage = VehicleImage & { available: boolean };

export type VehicleVideo = {
  src: string;
  /** Poster image shown before playback and when video is unavailable. */
  poster: VehicleImage;
  /** Short description for assistive technology. */
  label: string;
};

export type ResolvedVideo = Omit<VehicleVideo, "poster"> & {
  available: boolean;
  poster: ResolvedImage;
};
