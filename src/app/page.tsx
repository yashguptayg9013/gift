import { Gallery } from "@/components/gallery/Gallery";
import { Hero } from "@/components/hero/Hero";
import { Build } from "@/components/sections/Build";
import { Cockpit } from "@/components/sections/Cockpit";
import { Details } from "@/components/sections/Details";
import { Drive } from "@/components/sections/Drive";
import { FinalFrame } from "@/components/sections/FinalFrame";
import { Footer } from "@/components/sections/Footer";
import { Machine } from "@/components/sections/Machine";
import { Manifesto } from "@/components/sections/Manifesto";
import { Sequence } from "@/components/sections/Sequence";
import { Silhouette } from "@/components/sections/Silhouette";
import { Specification } from "@/components/sections/Specification";
import { gallery } from "@/data/gallery";
import * as media from "@/data/media";
import { modifications } from "@/data/modifications";
import { listSequenceFrames, resolveImage, resolveVideo } from "@/lib/media";

/**
 * The film, in running order. This is a Server Component: it checks
 * which photographs exist in /public and hands each section either the
 * real image or its placeholder.
 */
export default function Home() {
  return (
    <>
      <Hero image={resolveImage(media.hero)} />
      <Manifesto />
      <Machine image={resolveImage(media.machine)} />
      <Silhouette frames={media.silhouette.map((f) => ({ ...f, image: resolveImage(f.image) }))} />
      <Sequence frames={listSequenceFrames(media.sequence.dir)} />
      <Details items={media.details.map((d) => ({ ...d, image: resolveImage(d.image) }))} />
      <Cockpit
        dashboard={resolveImage(media.cockpit.dashboard)}
        steering={resolveImage(media.cockpit.steering)}
        seats={resolveImage(media.cockpit.seats)}
        speaker={resolveImage(media.cockpit.speaker)}
      />
      <Drive image={resolveImage(media.drive.image)} video={resolveVideo(media.drive.video)} />
      <Build items={modifications.map((m) => ({ ...m, image: resolveImage(m.image) }))} />
      <Specification />
      <Gallery items={gallery.map((g) => ({ ...g, image: resolveImage(g.image) }))} />
      <FinalFrame image={resolveImage(media.finalFrame)} />
      <Footer />
    </>
  );
}
