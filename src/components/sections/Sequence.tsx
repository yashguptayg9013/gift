import { sequence } from "@/data/media";
import { FrameSequence } from "./FrameSequence";

/**
 * Optional: a scroll-scrubbed sequence of real photographs. Rendered
 * only when frames exist in /public/images/sequence.
 */
export function Sequence({ frames }: { frames: string[] }) {
  if (frames.length < 2) return null;

  return (
    <section aria-labelledby="sequence-title" className="relative bg-obsidian">
      <FrameSequence frames={frames} mobileStep={sequence.mobileStep}>
        <div className="frame pointer-events-none absolute inset-x-0 bottom-0 pb-14">
          <h2 id="sequence-title" className="t-display-lg text-metal">
            {sequence.headline}
          </h2>
          <p className="t-label mt-4">{sequence.note}</p>
        </div>
      </FrameSequence>
    </section>
  );
}
