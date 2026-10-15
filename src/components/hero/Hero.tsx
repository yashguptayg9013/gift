import type { CSSProperties } from "react";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { vehicle } from "@/data/vehicle";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { HeroMotion } from "./HeroMotion";

/**
 * The opening frame. Markup is rendered on the server; HeroMotion
 * choreographs it. Layers, back to front:
 *   camera (photo) → darkness → vignette → light beam → frame UI → title
 */
export function Hero({ image }: { image: ResolvedImage }) {
  const copy = site.copy.hero;

  return (
    <section style={{ "--ph-tag-top": "calc(var(--nav-h) + 0.25rem)" } as CSSProperties}
      id="top"
      tabIndex={-1}
      aria-labelledby="hero-title"
      className="relative h-[100svh] min-h-[600px] w-full overflow-hidden bg-obsidian outline-none"
    >
      <HeroMotion>
        {/* Scene ------------------------------------------------------ */}
        <div data-hero-scene className="absolute inset-0">
          <div data-hero-drift className="absolute -inset-[3%]">
            <div data-hero-camera data-intro className="absolute inset-0">
              <div data-hero-reveal className="absolute inset-0">
                <Media image={image} sizes="100vw" preload />
              </div>
            </div>
          </div>
          {/* Ambient key light from above */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_0%,rgb(230_232_234/0.10),transparent_70%)]"
          />
          <div data-hero-dark aria-hidden className="absolute inset-0 bg-obsidian opacity-20" />
          <div aria-hidden className="vignette absolute inset-0" />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent"
          />
          <div data-hero-beam data-intro aria-hidden className="light-beam" />
        </div>

        {/* Viewfinder framing ---------------------------------------- */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-[var(--gutter)] bottom-6 top-[calc(var(--nav-h)+1rem)] md:bottom-10">
            <span data-hero-corner data-intro className="crop-mark left-0 top-0 border-l border-t" />
            <span data-hero-corner data-intro className="crop-mark right-0 top-0 border-r border-t" />
            <span data-hero-corner data-intro className="crop-mark bottom-0 left-0 border-b border-l" />
            <span data-hero-corner data-intro className="crop-mark bottom-0 right-0 border-b border-r" />
          </div>
        </div>

        {/* Content ---------------------------------------------------- */}
        <div data-hero-content className="absolute inset-0 flex flex-col">
          <div className="frame flex justify-between pt-[calc(var(--nav-h)+2.25rem)]">
            <p data-hero-label data-intro className="t-label">
              {copy.chapter}
            </p>
            <p data-hero-label data-intro className="t-label hidden text-right sm:block">
              {copy.tagline}
            </p>
          </div>

          <div className="frame mt-auto pb-24 md:pb-20">
            <p data-hero-label data-intro className="t-label mb-5 flex items-center gap-3 normal-case text-silver/80 md:mb-7">
              <span aria-hidden className="inline-block h-px w-8 bg-crimson" />
              {vehicle.label}
            </p>
            <h1 id="hero-title" data-intro className="t-hero max-w-[16ch]">
              <span className="sr-only">{site.title} — </span>
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h1>
            <div className="mt-6 flex flex-col gap-8 md:mt-8 md:flex-row md:items-end md:justify-between">
              <p data-hero-sub data-intro className="t-lead max-w-[36ch] text-silver/80">
                {copy.supporting}
              </p>
            </div>
          </div>

          <div
            data-hero-cue
            data-intro
            className="absolute bottom-10 right-[calc(var(--gutter)+1.5rem)] flex items-center gap-4 md:bottom-16"
            aria-hidden
          >
            <span className="t-label">Scroll</span>
            <span className="relative block h-12 w-px overflow-hidden bg-silver/15">
              <span className="scroll-cue-line absolute inset-0 bg-silver/80" />
            </span>
          </div>
        </div>
      </HeroMotion>
    </section>
  );
}
