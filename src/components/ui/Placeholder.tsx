import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { cn } from "@/lib/cn";
import { PLACEHOLDER_ART } from "./placeholder-art";

/** Art-directed stand-in shown until the real photograph is added. */
export function Placeholder({
  image,
  className,
  as: Tag = "div",
  fit: fitOverride,
}: {
  image: ResolvedImage;
  className?: string;
  as?: "div" | "span";
  /** Force the whole drawing to show (e.g. in the lightbox). */
  fit?: "slice" | "meet";
}) {
  const art = PLACEHOLDER_ART[image.placeholder.art];
  const fit = fitOverride ?? image.placeholder.fit ?? "slice";

  return (
    <Tag
      role="img"
      aria-label={`Placeholder illustration — ${image.alt}`}
      className={cn("placeholder-surface block overflow-hidden", className)}
    >
      <svg
        aria-hidden
        focusable="false"
        viewBox={image.placeholder.viewBox ?? art.viewBox}
        preserveAspectRatio={`xMidYMid ${fit}`}
        className="absolute inset-0 h-full w-full"
      >
        {art.content}
      </svg>
      {site.showPlaceholderLabels && (
        <span className="placeholder-tag" aria-hidden>
          {`Placeholder · public${image.src}`}
        </span>
      )}
    </Tag>
  );
}
