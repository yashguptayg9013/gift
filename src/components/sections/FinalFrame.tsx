import type { CSSProperties } from "react";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { vehicle } from "@/data/vehicle";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { FinalMotion } from "./FinalMotion";
import { ReplayButton } from "./ReplayButton";

/** Section E — the closing shot, and a way to run the film again. */
export function FinalFrame({ image }: { image: ResolvedImage }) {
  const copy = site.copy.final;

  return (
    <section style={{ "--ph-tag-top": "calc(var(--nav-h) + 0.25rem)" } as CSSProperties} aria-labelledby="final-title" className="relative bg-obsidian">
      <FinalMotion>
        <div className="relative h-[100svh] min-h-[600px] overflow-hidden">
          <div data-final-media className="absolute inset-0">
            <Media image={image} sizes="100vw" />
          </div>
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_55%,transparent_0%,rgb(8_9_11/0.75)_75%,#08090b_100%)]" />
          <div data-final-dark aria-hidden className="absolute inset-0 bg-obsidian opacity-0" />

          <div className="frame relative flex h-full flex-col items-center justify-center text-center">
            <p data-final-fade className="t-label mb-8 flex items-center gap-3">
              <span aria-hidden className="inline-block h-px w-8 bg-crimson" />
              {copy.chapter}
              <span aria-hidden className="inline-block h-px w-8 bg-crimson" />
            </p>
            <h2 id="final-title" className="t-display-xl">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h2>
            <div data-final-fade className="mt-12 md:mt-16">
              <ReplayButton label={copy.replay} />
            </div>
          </div>

          <p data-final-fade className="t-label absolute bottom-8 left-[var(--gutter)] normal-case">
            {vehicle.label}
          </p>
          <p data-final-fade className="t-label absolute bottom-8 right-[var(--gutter)] hidden normal-case sm:block">
            {site.projectName}
          </p>
        </div>
      </FinalMotion>
    </section>
  );
}
