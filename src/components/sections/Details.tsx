import type { DetailLayout } from "@/data/media";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { cn } from "@/lib/cn";

type Detail = { title: string; line: string; layout: DetailLayout; image: ResolvedImage };

/** Grid placement + crop for each layout. Literal strings so Tailwind sees them. */
const LAYOUT: Record<DetailLayout, { figure: string; frame: string; sizes: string }> = {
  "large-left": {
    figure: "md:col-span-7 md:col-start-1",
    frame: "aspect-[5/4]",
    sizes: "(min-width: 768px) 58vw, 100vw",
  },
  "small-right": {
    figure: "md:col-span-4 md:col-start-9 md:mt-[28vh]",
    frame: "aspect-[4/5]",
    sizes: "(min-width: 768px) 33vw, 100vw",
  },
  wide: {
    figure: "md:col-span-12",
    frame: "aspect-[4/3] md:aspect-[21/9]",
    sizes: "100vw",
  },
  "small-left": {
    figure: "md:col-span-4 md:col-start-2",
    frame: "aspect-[4/5]",
    sizes: "(min-width: 768px) 33vw, 100vw",
  },
  "large-right": {
    figure: "md:col-span-6 md:col-start-7 md:mt-[22vh]",
    frame: "aspect-[5/4]",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
};

/** Section C — close-ups, each with a single line of annotation. */
export function Details({ items }: { items: Detail[] }) {
  const copy = site.copy.details;

  return (
    <section id="details" tabIndex={-1} aria-labelledby="details-title" className="section-y relative bg-obsidian outline-none">
      <Reveal className="frame">
        <header className="mb-20 grid gap-8 md:mb-32 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <Chapter className="mb-8">{copy.chapter}</Chapter>
            <h2 id="details-title" data-reveal="words" className="t-display-xl">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h2>
          </div>
          <p data-reveal="fade" className="t-body max-w-[38ch] md:col-span-4">
            {copy.supporting}
          </p>
        </header>

        <ol className="grid grid-cols-1 gap-x-6 gap-y-20 md:grid-cols-12 md:gap-y-36">
          {items.map((item, i) => {
            const layout = LAYOUT[item.layout];
            return (
              <li key={item.title} className={cn("relative", layout.figure)}>
                <figure>
                  <div data-reveal="mask" className={cn("relative overflow-hidden bg-carbon", layout.frame)}>
                    <div data-reveal-inner className="absolute inset-0">
                      <div data-parallax="5" className="absolute -inset-y-[6%] inset-x-0">
                        <Media image={item.image} sizes={layout.sizes} />
                      </div>
                    </div>
                  </div>
                  <figcaption className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 md:mt-6">
                    <span data-reveal="fade" className="t-label text-crimson">
                      C.{String(i + 1).padStart(2, "0")}
                    </span>
                    <span data-reveal="fade" className="t-display-sm text-silver">
                      {item.title}
                    </span>
                    <span data-reveal="fade" className="t-body col-start-2 max-w-[40ch]">
                      {item.line}
                    </span>
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ol>
      </Reveal>
    </section>
  );
}
