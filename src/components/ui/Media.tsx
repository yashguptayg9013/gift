import Image from "next/image";
import type { CSSProperties } from "react";
import type { ResolvedImage } from "@/data/types";
import { cn } from "@/lib/cn";
import { Placeholder } from "./Placeholder";

type MediaProps = {
  image: ResolvedImage;
  /** Responsive `sizes` hint, e.g. "(min-width: 768px) 50vw, 100vw". */
  sizes: string;
  /** Preload only the above-the-fold (LCP) image. */
  preload?: boolean;
  className?: string;
  fit?: "cover" | "contain";
  /** Use "span" inside phrasing-only parents such as <button>. */
  as?: "div" | "span";
};

/**
 * A photograph that fills its parent (the wrapper is `absolute inset-0`
 * by default). Falls back to a labelled placeholder when the file is
 * missing from /public.
 */
export function Media({ image, sizes, preload = false, className, fit = "cover", as: Tag = "div" }: MediaProps) {
  const wrapper = cn("absolute inset-0", className);

  if (!image.available) {
    return <Placeholder image={image} className={wrapper} as={Tag} fit={fit === "contain" ? "meet" : undefined} />;
  }

  const style = {
    "--pos": image.position ?? "50% 50%",
    "--pos-m": image.mobilePosition ?? image.position ?? "50% 50%",
  } as CSSProperties;

  return (
    <Tag className={cn("block overflow-hidden", fit === "cover" && "bg-graphite", wrapper)}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        preload={preload}
        quality={80}
        className={cn("media-pos", fit === "cover" ? "object-cover" : "object-contain")}
        style={style}
      />
    </Tag>
  );
}
