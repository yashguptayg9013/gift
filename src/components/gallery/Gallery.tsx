import type { GalleryItem, GalleryLayout } from "@/data/gallery";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { cn } from "@/lib/cn";
import { GalleryLightbox } from "./GalleryLightbox";

type Item = Omit<GalleryItem, "image"> & { image: ResolvedImage };

const LAYOUT: Record<GalleryLayout, { cell: string; frame: string; sizes: string }> = {
  full: { cell: "md:col-span-12", frame: "aspect-[4/3] md:aspect-[21/9]", sizes: "100vw" },
  wide: { cell: "md:col-span-7", frame: "aspect-[3/2]", sizes: "(min-width: 768px) 58vw, 100vw" },
  tall: { cell: "md:col-span-5 md:mt-[14vh]", frame: "aspect-[4/5]", sizes: "(min-width: 768px) 42vw, 100vw" },
  half: { cell: "md:col-span-6", frame: "aspect-square", sizes: "(min-width: 768px) 50vw, 100vw" },
};

/** Editorial gallery. Every frame opens the lightbox. */
export function Gallery({ items }: { items: Item[] }) {
  const copy = site.copy.gallery;

  return (
    <section id="gallery" tabIndex={-1} aria-labelledby="gallery-title" className="section-y relative bg-obsidian outline-none">
      <Reveal className="frame">
        <header className="mb-16 flex flex-col gap-8 md:mb-24 md:flex-row md:items-end md:justify-between">
          <div>
            <Chapter className="mb-8">{copy.chapter}</Chapter>
            <h2 id="gallery-title" data-reveal="words" className="t-display-xl">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h2>
          </div>
          <p data-reveal="fade" className="t-body">
            {copy.supporting}
          </p>
        </header>

        <GalleryLightbox items={items.map((item) => ({ caption: item.caption, image: item.image }))}>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-12 md:gap-y-20">
            {items.map((item, i) => {
              const layout = LAYOUT[item.layout];
              return (
                <li key={item.image.src} className={layout.cell}>
                  <button
                    type="button"
                    data-gallery-open={i}
                    className="group block w-full text-left"
                    aria-label={`Open image ${i + 1} of ${items.length}: ${item.caption}`}
                  >
                    <span data-reveal="mask" className={cn("relative block overflow-hidden bg-carbon", layout.frame)}>
                      <span
                        data-reveal-inner
                        className="absolute inset-0 block transition-transform duration-[1.4s] ease-[var(--ease-reveal)] group-hover:scale-[1.03]"
                      >
                        <Media as="span" image={item.image} sizes={layout.sizes} />
                      </span>
                    </span>
                    <span className="mt-4 flex items-baseline justify-between gap-6">
                      <span className="t-label tabular-nums text-crimson">{String(i + 1).padStart(2, "0")}</span>
                      <span className="t-label flex-1 text-silver">{item.caption}</span>
                      <span aria-hidden className="t-label opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                        View
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </GalleryLightbox>
      </Reveal>
    </section>
  );
}
