import { PenLine } from "lucide-react";
import { site } from "@/data/site";
import { vehicle } from "@/data/vehicle";
import { Reveal } from "@/components/motion/Reveal";
import { Chapter } from "@/components/ui/Chapter";
import { SplitWords } from "@/components/ui/SplitWords";

function Missing({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-steel">
      <PenLine aria-hidden size={14} strokeWidth={1.25} />
      <span className="border-b border-dashed border-steel/50">{text}</span>
    </span>
  );
}

/** Owner-supplied facts only; unknown values are shown as open fields. */
export function Specification() {
  const copy = site.copy.specification;
  const specs = vehicle.specs.filter((s) => s.value !== null || !("hideWhenEmpty" in s && s.hideWhenEmpty));

  return (
    <section
      id="specification"
      tabIndex={-1}
      aria-labelledby="spec-title"
      className="section-y relative border-t border-line bg-carbon outline-none"
    >
      <Reveal className="frame grid gap-16 md:grid-cols-12 md:gap-x-6">
        <div className="md:col-span-4">
          <div className="md:sticky md:top-[calc(var(--nav-h)+3rem)]">
            <Chapter className="mb-8">{copy.chapter}</Chapter>
            <h2 id="spec-title" data-reveal="words" className="t-display-lg">
              <SplitWords text={copy.headline} wordClassName="text-metal" />
            </h2>
            <p data-reveal="fade" className="t-body mt-8 max-w-[34ch]">
              {copy.supporting}
            </p>
            <p data-reveal="fade" className="t-label mt-10 normal-case text-silver">
              {vehicle.label}
            </p>
          </div>
        </div>

        <div className="md:col-span-7 md:col-start-6">
          <dl>
            {specs.map((spec) => (
              <div
                key={spec.label}
                data-reveal="fade"
                className="grid grid-cols-1 gap-2 border-t border-line py-6 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:items-baseline sm:gap-6 md:py-8"
              >
                <dt className="t-label">{spec.label}</dt>
                <dd className="font-display text-[clamp(1.5rem,2.4vw,2.25rem)] font-medium leading-none tracking-[0.01em] text-white">
                  {spec.value ?? <Missing text={spec.placeholder} />}
                </dd>
              </div>
            ))}
            <div
              data-reveal="fade"
              className="grid grid-cols-1 gap-2 border-y border-line py-6 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:items-baseline sm:gap-6 md:py-8"
            >
              <dt className="t-label">Installed accessories</dt>
              <dd className="text-lg text-silver">
                {vehicle.accessories.length > 0 ? (
                  <ul className="space-y-2">
                    {vehicle.accessories.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <Missing text="Add installed accessories" />
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-6 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-steel">
            Edit these values in src/data/vehicle.ts
          </p>
        </div>
      </Reveal>
    </section>
  );
}
