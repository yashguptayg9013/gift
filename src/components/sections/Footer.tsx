import { site } from "@/data/site";
import { AnchorLink } from "@/components/navigation/AnchorLink";
import { Wordmark } from "@/components/navigation/Wordmark";

export function Footer() {
  return (
    <footer className="border-t border-line bg-obsidian">
      <div className="frame grid gap-10 py-14 md:grid-cols-12 md:items-start md:py-20">
        <div className="md:col-span-4">
          <Wordmark />
          <p className="t-label mt-4 normal-case">{site.title}</p>
        </div>
        <p className="t-body text-sm md:col-span-6 md:col-start-6">{site.copy.footer.disclaimer}</p>
        <AnchorLink href="#top" className="link-line t-label justify-self-start text-silver md:col-span-1 md:col-start-12 md:justify-self-end">
          Top
        </AnchorLink>
      </div>
    </footer>
  );
}
