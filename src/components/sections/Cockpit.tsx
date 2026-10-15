import type { CSSProperties } from "react";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { Sound } from "./Sound";

type Props = {
  dashboard: ResolvedImage;
  steering: ResolvedImage;
  infotainment: ResolvedImage;
  speaker: ResolvedImage;
};

/** The interior: a full-frame cabin shot, two close studies, then sound. */
export function Cockpit({ dashboard, steering, infotainment, speaker }: Props) {
  const copy = site.copy.cockpit;

  return (
    <section style={{ "--ph-tag-top": "calc(var(--nav-h) + 0.25rem)" } as CSSProperties} id="the-cockpit" tabIndex={-1} aria-labelledby="cockpit-title" className="relative bg-obsidian outline-none">
      <Reveal>
        <div className="relative h-[100svh] min-h-[560px] overflow-hidden">
          <div data-zoom className="absolute inset-0">
            <Media image={dashboard} sizes="100vw" />
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-obsidian/70 via-obsidian/10 to-obsidian" />
          <div className="frame relative flex h-full flex-col justify-between pb-16 pt-[calc(var(--nav-h)+2rem)] md:pb-24">
            <Chapter>{copy.chapter}</Chapter>
            <div className="grid gap-8 md:grid-cols-12 md:items-end">
              <h2 id="cockpit-title" data-reveal="words" className="t-display-xl md:col-span-8">
                <SplitWords text={copy.headline} wordClassName="text-metal" />
              </h2>
              <p data-reveal="fade" className="t-lead max-w-[30ch] md:col-span-4 md:pb-3">
                {copy.supporting}
              </p>
            </div>
          </div>
        </div>

        <div className="frame section-y grid gap-y-16 md:grid-cols-12 md:gap-x-6">
          <figure className="md:col-span-5">
            <div data-reveal="mask" className="relative aspect-[4/5] overflow-hidden bg-carbon">
              <div data-reveal-inner className="absolute inset-0">
                <Media image={steering} sizes="(min-width: 768px) 42vw, 100vw" />
              </div>
            </div>
            <figcaption className="mt-5 flex items-baseline justify-between gap-6">
              <span data-reveal="fade" className="t-display-sm">{copy.steering.title}</span>
              <span data-reveal="fade" className="t-body text-right">{copy.steering.line}</span>
            </figcaption>
          </figure>
          <figure className="md:col-span-6 md:col-start-7 md:mt-[24vh]">
            <div data-reveal="mask" className="relative aspect-[4/3] overflow-hidden bg-carbon">
              <div data-reveal-inner className="absolute inset-0">
                <Media image={infotainment} sizes="(min-width: 768px) 50vw, 100vw" />
              </div>
            </div>
            <figcaption className="mt-5 flex items-baseline justify-between gap-6">
              <span data-reveal="fade" className="t-display-sm">{copy.infotainment.title}</span>
              <span data-reveal="fade" className="t-body text-right">{copy.infotainment.line}</span>
            </figcaption>
          </figure>
        </div>
      </Reveal>

      {site.copy.audio.enabled && <Sound speaker={speaker} />}
    </section>
  );
}
