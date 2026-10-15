import type { Modification, ModStatus } from "@/data/modifications";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { cn } from "@/lib/cn";
import { BuildMotion } from "./BuildMotion";

type Mod = Omit<Modification, "image"> & { image: ResolvedImage };

const pad = (n: number) => String(n).padStart(2, "0");

function Status({ status }: { status?: ModStatus }) {
  if (!status) {
    return <span className="t-label border border-dashed border-line-strong px-2 py-0.5 text-steel">Status to confirm</span>;
  }
  return (
    <span className="t-label inline-flex items-center gap-2 text-silver">
      <span
        aria-hidden
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          status === "Installed" && "bg-crimson",
          status === "Planned" && "border border-silver",
          status === "Stock" && "bg-steel",
        )}
      />
      {status}
    </span>
  );
}

/** THE BUILD — what is original, what has changed, what is next. */
export function Build({ items }: { items: Mod[] }) {
  const copy = site.copy.build;

  return (
    <section id="the-build" tabIndex={-1} aria-labelledby="build-title" className="section-y relative bg-obsidian outline-none">
      <Reveal className="frame">
        <header className="mb-16 grid gap-8 md:mb-24 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Chapter className="mb-8">{copy.chapter}</Chapter>
            <h2 id="build-title" data-reveal="words" className="t-display-xl">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h2>
          </div>
          <div className="md:col-span-4 md:col-start-9">
            <p data-reveal="fade" className="t-body max-w-[40ch]">
              {copy.supporting}
            </p>
            <p data-reveal="fade" className="mt-6 flex flex-wrap gap-x-6 gap-y-2" aria-label="Status legend">
              <Status status="Installed" />
              <Status status="Planned" />
              <Status status="Stock" />
            </p>
          </div>
        </header>
      </Reveal>

      <BuildMotion className="frame grid md:grid-cols-12 md:gap-x-6">
        {/* Sticky image panel — desktop */}
        <div className="hidden md:col-span-5 md:block">
          <div className="sticky top-[calc(var(--nav-h)+2rem)] aspect-[4/5] max-h-[calc(100svh-var(--nav-h)-4rem)] w-full overflow-hidden bg-carbon">
            {items.map((item, i) => (
              <div key={item.name} data-build-image className={cn("absolute inset-0", i > 0 && "opacity-0")}>
                <Media image={item.image} sizes="(min-width: 768px) 40vw, 1px" />
              </div>
            ))}
            <div aria-hidden className="absolute inset-x-0 top-0 flex justify-between bg-gradient-to-b from-obsidian/80 to-transparent p-5">
              <span className="t-label text-silver tabular-nums">
                <span data-build-index>01</span> / {pad(items.length)}
              </span>
              <span className="t-label">Build log</span>
            </div>
          </div>
        </div>

        <ol className="md:col-span-6 md:col-start-7">
          {items.map((item, i) => (
            <li
              key={item.name}
              data-build-row
              className="grid grid-cols-[3rem_1fr] gap-x-4 border-t border-line py-12 transition-opacity duration-500 last:border-b md:grid-cols-[4rem_1fr] md:py-16"
            >
              <span className="t-label pt-1 tabular-nums text-crimson">{pad(i + 1)}</span>
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span className="t-label">{item.category}</span>
                  <Status status={item.status} />
                  {item.date && <span className="t-label">{item.date}</span>}
                </div>
                <h3 className="t-display-md text-white">{item.name}</h3>
                <p className="t-body mt-4 max-w-[46ch]">{item.description}</p>
                {item.details && item.details.length > 0 && (
                  <ul className="mt-6 space-y-2 border-l border-line pl-4">
                    {item.details.map((d) => (
                      <li key={d} className="t-body text-sm">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
                {item.placeholder && (
                  <p className="mt-6 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-steel">
                    Placeholder entry — edit in src/data/modifications.ts
                  </p>
                )}
                <div className="relative mt-8 aspect-[4/5] overflow-hidden bg-carbon md:hidden">
                  <Media image={item.image} sizes="(max-width: 767px) 85vw, 1px" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </BuildMotion>
    </section>
  );
}
