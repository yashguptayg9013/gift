import type { CSSProperties } from "react";
import { site } from "@/data/site";
import type { ResolvedImage, ResolvedVideo } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Chapter } from "@/components/ui/Chapter";
import { Media } from "@/components/ui/Media";
import { SplitWords } from "@/components/ui/SplitWords";
import { DriveVideo } from "./DriveVideo";

/**
 * Section D — the frame holds still (CSS sticky) while short phrases
 * pass over it, like title cards in a road film. Uses real footage if
 * /public/videos/drive.mp4 exists, otherwise the still photograph.
 */
export function Drive({ image, video }: { image: ResolvedImage; video: ResolvedVideo }) {
  const copy = site.copy.drive;

  return (
    <section style={{ "--ph-tag-top": "calc(var(--nav-h) + 0.25rem)" } as CSSProperties} id="drive" aria-labelledby="drive-title" className="relative bg-obsidian">
      <Reveal>
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          <div data-drive-media className="absolute inset-0">
            {video.available ? (
              <DriveVideo video={video} />
            ) : (
              <div data-zoom="section" className="absolute inset-0">
                <Media image={image} sizes="100vw" />
              </div>
            )}
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-obsidian via-obsidian/20 to-obsidian/80" />
        </div>

        <div className="pointer-events-none relative -mt-[100svh]">
          <div className="frame flex h-[60svh] items-start pt-[calc(var(--nav-h)+2rem)]">
            <Chapter>{copy.chapter}</Chapter>
          </div>
          {copy.lines.map((line, i) => (
            <div
              key={line}
              className={i % 2 ? "frame flex h-[90svh] items-center justify-end text-right" : "frame flex h-[90svh] items-center"}
            >
              <p data-reveal="words" className="t-display-md max-w-[14ch] text-silver">
                <SplitWords text={line} />
              </p>
            </div>
          ))}
          <div className="frame flex min-h-[100svh] flex-col justify-end pb-20 md:pb-28">
            <h2 id="drive-title" data-reveal="words" className="t-display-xl">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h2>
            <p data-reveal="fade" className="t-lead mt-8 max-w-[38ch]">
              {copy.supporting}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
