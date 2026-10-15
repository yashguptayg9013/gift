import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { SoundVisualizer } from "./SoundVisualizer";

/** The audio system — copy, a speaker study, and the visualizer. */
export function Sound({ speaker }: { speaker: ResolvedImage }) {
  const copy = site.copy.audio;

  return (
    <div aria-labelledby="sound-title" role="region" className="relative border-t border-line bg-carbon">
      <Reveal className="frame section-y">
        <div className="grid gap-14 md:grid-cols-12 md:gap-x-6">
          <div className="md:col-span-6">
            <p data-reveal="fade" className="t-label mb-8 flex items-center gap-3">
              <span aria-hidden className="inline-block h-px w-8 bg-crimson" />
              {copy.eyebrow}
            </p>
            <h3 id="sound-title" data-reveal="words" className="t-display-lg">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h3>
            <p data-reveal="fade" className="t-lead mt-8 max-w-[36ch]">
              {copy.body}
            </p>
          </div>
          <figure className="md:col-span-5 md:col-start-8">
            <div data-reveal="mask" className="relative aspect-square overflow-hidden rounded-full bg-obsidian">
              <div data-reveal-inner className="absolute inset-0">
                <Media image={speaker} sizes="(min-width: 768px) 40vw, 90vw" />
              </div>
            </div>
          </figure>
        </div>

        <SoundVisualizer visualNote={copy.visualNote} demoNote={copy.demoNote} />
      </Reveal>
    </div>
  );
}
