import { site } from "@/data/site";
import type { ResolvedImage } from "@/data/types";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { SilhouetteMotion } from "./SilhouetteMotion";

type Frame = { title: string; note: string; image: ResolvedImage };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Section B — front, side, rear and a close-up. On desktop the stage
 * pins and each view wipes over the last. These are separate
 * photographs and are presented as such: numbered views, not a spin.
 */
export function Silhouette({ frames }: { frames: Frame[] }) {
  const copy = site.copy.silhouette;

  return (
    <section aria-labelledby="silhouette-title" className="relative bg-obsidian">
      <SilhouetteMotion count={frames.length}>
        <div data-sil-stage className="frame flex flex-col justify-center py-24 md:py-40">
          <header className="mb-8 grid gap-6 md:mb-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <Chapter className="mb-6">{copy.chapter}</Chapter>
              <h2 id="silhouette-title" data-reveal="words" className="t-display-lg">
                <SplitWords text={copy.headline} wordClassName="text-metal" />
              </h2>
            </div>
            <p data-reveal="fade" className="t-body max-w-[42ch] md:col-span-4 md:col-start-9">
              {copy.supporting}
            </p>
          </header>

          <div data-sil-viewport className="sil-viewport">
            {frames.map((frame, i) => (
              <figure
                key={frame.title}
                data-sil-frame
                className="sil-frame overflow-hidden bg-carbon"
              >
                <div data-sil-media className="absolute inset-0">
                  <Media image={frame.image} sizes="(min-width: 1680px) 1600px, 100vw" />
                </div>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-obsidian/70 via-transparent to-transparent" />
                <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 md:p-6">
                  <span className="t-label text-silver">
                    View {pad(i + 1)} — {frame.title}
                  </span>
                  <span className="t-label hidden sm:block">{frame.note}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Progress — only while pinned, purely visual */}
          <div aria-hidden className="sil-progress mt-6 hidden items-center gap-6">
            <span className="t-label tabular-nums text-silver">
              <span data-sil-index>01</span> / {pad(frames.length)}
            </span>
            <div className="flex flex-1 gap-2">
              {frames.map((frame) => (
                <span key={frame.title} className="relative h-px flex-1 bg-line">
                  <span data-sil-bar className="absolute inset-0 origin-left bg-silver" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </SilhouetteMotion>
    </section>
  );
}
