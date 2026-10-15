import { site } from "@/data/site";
import { SplitWords } from "@/components/ui/SplitWords";
import { ManifestoMotion } from "./ManifestoMotion";

/** A title-card interlude between the opening and the first scene. */
export function Manifesto() {
  return (
    <section aria-label="Manifesto" className="relative bg-obsidian">
      <ManifestoMotion>
        <div className="frame flex min-h-[100svh] flex-col justify-center py-32">
          <p className="t-label mb-10 normal-case md:mb-14">{site.projectName}</p>
          <div className="space-y-2 md:space-y-3">
            {site.copy.manifesto.map((line, i) => (
              <p
                key={line}
                data-manifesto-line
                className={
                  i === 1
                    ? "t-display-lg text-silver md:whitespace-nowrap md:pl-[8vw] md:text-[clamp(2.5rem,5.6vw,6.5rem)]"
                    : i === 2
                      ? "t-display-lg text-silver md:whitespace-nowrap md:pl-[16vw] md:text-[clamp(2.5rem,5.6vw,6.5rem)]"
                      : "t-display-lg text-silver md:whitespace-nowrap md:text-[clamp(2.5rem,5.6vw,6.5rem)]"
                }
              >
                <SplitWords text={line} />
              </p>
            ))}
          </div>
        </div>
      </ManifestoMotion>
    </section>
  );
}
