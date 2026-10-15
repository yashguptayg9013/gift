/**
 * Server-only helpers that check which photographs actually exist in
 * /public. Runs at build time (static generation) and per request in
 * development, so dropping a file into /public is all it takes.
 */

import fs from "node:fs";
import path from "node:path";
import type { ResolvedImage, ResolvedVideo, VehicleImage, VehicleVideo } from "@/data/types";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export function assetExists(src: string): boolean {
  if (!src.startsWith("/")) return false;
  try {
    return fs.statSync(path.join(PUBLIC_DIR, src)).isFile();
  } catch {
    return false;
  }
}

/** Phone photos are usually .jpg — accept any web image format at the configured path. */
const IMAGE_EXTENSIONS = [".webp", ".avif", ".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"];

/**
 * Finds the photo for a slot. "/images/hero/hero-front.webp" also matches
 * hero-front.jpg, hero-front.png, etc., so photos can be uploaded as-is.
 */
export function resolveImage(image: VehicleImage): ResolvedImage {
  if (assetExists(image.src)) return { ...image, available: true };
  const base = image.src.replace(/\.[a-z0-9]+$/i, "");
  const found = IMAGE_EXTENSIONS.map((ext) => base + ext).find(assetExists);
  return found ? { ...image, src: found, available: true } : { ...image, available: false };
}

export function resolveVideo(video: VehicleVideo): ResolvedVideo {
  return { ...video, available: assetExists(video.src), poster: resolveImage(video.poster) };
}

/** Sorted list of frame URLs (frame-0001.webp …) for the optional frame sequence. */
export function listSequenceFrames(dir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(PUBLIC_DIR, dir))
      .filter((file) => /^frame-\d+\.(webp|avif|jpe?g|png)$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => `${dir}/${file}`);
  } catch {
    return [];
  }
}
