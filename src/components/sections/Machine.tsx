import type { CSSProperties } from "react";
import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { vehicle } from "@/data/vehicle";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { MachineMotion } from "./MachineMotion";

/** Section A — the car emerges from a small window to fill the screen. */
export function Machine({ image }: { image: ResolvedImage }) {
  const copy = site.copy.machine;

  return (
    <section style={{ "--ph-tag-top": "calc(var(--nav-h) + 0.25rem)" } as CSSProperties} id="the-car" tabIndex={-1} aria-labelledby="machine-title" className="relative bg-obsidian outline-none">
      <MachineMotion>
        <div data-machine-stage className="relative h-[100svh] min-h-[560px] overflow-hidden">
          {/* Shifting key light behind the frame */}
          <div
            data-machine-light
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(45%_55%_at_50%_45%,rgb(230_232_234/0.09),transparent_70%)]"
          />

          <div data-machine-frame className="absolute inset-0 overflow-hidden">
            <div data-machine-image className="absolute -inset-[6%]">
              <Media image={image} sizes="100vw" />
            </div>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/20 to-obsidian/40" />
          </div>

          <div className="frame relative flex h-full flex-col justify-between pb-14 pt-[calc(var(--nav-h)+2rem)] md:pb-20">
            <div className="flex items-start justify-between">
              <Chapter>{copy.chapter}</Chapter>
              <p data-machine-label className="t-label hidden text-right normal-case md:block">
                VIEW — {copy.view.toUpperCase()}
                <br />
                {vehicle.label}
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-12 md:items-end">
              <h2 id="machine-title" className="t-display-xl md:col-span-8">
                <SplitWords text={copy.headline} wordClassName="text-metal" />
              </h2>
              <div className="md:col-span-4 md:pb-3">
                <span data-machine-rule aria-hidden className="mb-5 block h-px w-full origin-left bg-line-strong" />
                <p data-machine-copy className="t-lead max-w-[34ch]">
                  {copy.supporting}
                </p>
              </div>
            </div>
          </div>
        </div>
      </MachineMotion>
    </section>
  );
}
