import Image from "next/image";
import { Heart } from "./components/Heart";
import { AnniversaryDate, LiveCounter } from "./components/LiveCounter";
import { Question } from "./components/Question";
import { Reveal } from "./components/Reveal";
import { SectionHeader } from "./components/SectionHeader";
import { fill, love } from "./love.config";

const NAV = [
  ["Our Story", "#story"],
  ["Moments", "#moments"],
  ["Reasons", "#reasons"],
  ["Letter", "#letter"],
  ["Countdown", "#countdown"],
] as const;

const startLabel = new Date(`${love.startDate}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 font-script text-4xl ${light ? "text-blush" : "text-rose"}`}
    >
      {love.yourInitial}
      <Heart size={18} className="text-rose" />
      {love.herInitial}
    </span>
  );
}

const sectionX = "px-6 md:px-[120px]";

export default function Home() {
  return (
    <>
      <Reveal />

      {/* Nav */}
      <header className={`sticky top-0 z-40 bg-cream/85 backdrop-blur ${sectionX}`}>
        <nav className="mx-auto flex max-w-[1200px] items-center justify-between py-5 md:py-7">
          <a href="#top" aria-label="Back to top">
            <Logo />
          </a>
          <ul className="hidden items-center gap-10 text-[15px] font-medium md:flex">
            {NAV.map(([label, href]) => (
              <li key={href}>
                <a href={href} className="transition-colors hover:text-rose">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="#letter"
            className="rounded-full bg-rose px-4 py-2 text-sm font-semibold text-white md:hidden"
          >
            Letter
          </a>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section
          className={`relative overflow-hidden bg-gradient-to-b from-cream to-blush pb-[140px] pt-16 md:pt-[100px] ${sectionX}`}
        >
          {[
            ["5%", "18%", 64, "-15deg"],
            ["90%", "12%", 48, "12deg"],
            ["14%", "72%", 36, "20deg"],
            ["82%", "62%", 72, "-8deg"],
            ["45%", "4%", 28, "0deg"],
          ].map(([left, top, size, r], i) => (
            <Heart
              key={i}
              size={size as number}
              className="animate-float absolute text-rose opacity-[0.14]"
              style={
                {
                  left,
                  top,
                  "--r": r,
                  animationDelay: `${i * 0.8}s`,
                } as React.CSSProperties
              }
            />
          ))}

          <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-7 text-center">
            <span className="flex items-center gap-2 rounded-full border border-rose/30 bg-white px-[18px] py-2 text-sm font-medium text-rose-deep">
              <Heart size={14} className="animate-heartbeat text-rose" />
              Our little corner of the internet
            </span>
            <p className="font-script text-5xl text-rose md:text-[64px]">{love.hero.script}</p>
            <h1 className="font-display text-5xl font-bold leading-[1.05] md:text-[88px]">
              {love.yourName} &amp; {love.herName}
            </h1>
            <p className="max-w-[720px] text-lg font-light leading-relaxed text-muted md:text-xl">
              {fill(love.hero.tagline, { start: startLabel })}
            </p>
            <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-rose-deep">
              We have been together for
            </p>
            <LiveCounter startDate={love.startDate} mode="since" />
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              <a
                href="#story"
                className="rounded-full bg-rose px-9 py-[18px] font-semibold text-white shadow-[0_10px_24px_rgba(232,83,107,0.3)] transition hover:-translate-y-0.5 hover:bg-rose-deep"
              >
                Read our story
              </a>
              <a
                href="#letter"
                className="rounded-full border-[1.5px] border-rose bg-white px-9 py-[18px] font-semibold text-rose transition hover:-translate-y-0.5"
              >
                Open my letter
              </a>
            </div>
          </div>
        </section>

        {/* Our Story */}
        <section id="story" className={`bg-white py-24 md:py-[120px] ${sectionX}`}>
          <div className="mx-auto flex max-w-[1200px] flex-col gap-16">
            <SectionHeader
              eyebrow="Our story"
              title="How we became us"
              sub="From a nervous first hello to every ordinary day that feels extraordinary with you."
            />
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {love.story.map((s) => (
                <li
                  key={s.title}
                  className="reveal flex flex-col gap-3.5 rounded-3xl bg-cream px-7 py-8 transition hover:-translate-y-1"
                >
                  <span className="flex size-[52px] items-center justify-center rounded-full bg-blush">
                    <Heart size={22} className="text-rose" />
                  </span>
                  <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-rose">
                    {s.date}
                  </span>
                  <h3 className="font-display text-2xl font-bold leading-tight">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Moments */}
        <section id="moments" className={`bg-cream py-24 md:py-[120px] ${sectionX}`}>
          <div className="mx-auto flex max-w-[1200px] flex-col gap-16">
            <SectionHeader
              eyebrow="Moments"
              title="Little pieces of us"
              sub="A few of my favourite memories. Every photo has a story, and every story has you."
            />
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {love.moments.map((m) => (
                <figure key={m.caption} className="reveal group flex flex-col gap-3.5">
                  <div
                    className="relative flex aspect-[384/300] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-3xl text-white"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${m.colors[0]}, ${m.colors[1]})`,
                    }}
                  >
                    {m.image ? (
                      <Image
                        src={m.image}
                        alt={m.caption}
                        fill
                        sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <>
                        <Heart size={40} />
                        <span className="text-sm font-medium">Add your photo</span>
                      </>
                    )}
                  </div>
                  <figcaption>
                    <p className="font-display text-[22px] italic">{m.caption}</p>
                    <p className="text-sm text-muted">{m.date}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Reasons */}
        <section id="reasons" className={`bg-white py-24 md:py-[120px] ${sectionX}`}>
          <div className="mx-auto flex max-w-[1200px] flex-col gap-16">
            <SectionHeader
              eyebrow="Reasons I love you"
              title="Just a few of a million"
              sub="I could fill this whole website and still not run out. But here is a start."
            />
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {love.reasons.map((r, i) => (
                <li
                  key={r}
                  className="reveal flex flex-col gap-3 rounded-3xl border-[1.5px] border-blush bg-white px-8 pb-9 pt-8 transition hover:border-rose/40 hover:shadow-[0_12px_32px_rgba(232,83,107,0.12)]"
                >
                  <span className="font-script text-[52px] leading-none text-rose">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[17px] leading-relaxed">{r}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Love letter */}
        <section id="letter" className={`bg-wine py-24 md:py-[120px] ${sectionX}`}>
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-16">
            <SectionHeader eyebrow="A letter" title={`Just for you, ${love.herName}`} dark />
            <article className="reveal relative flex w-full max-w-[800px] flex-col gap-6 rounded-[32px] bg-cream px-7 py-12 shadow-[0_30px_60px_rgba(0,0,0,0.25)] md:px-[72px] md:py-16">
              <Heart size={40} className="absolute right-8 top-8 rotate-12 text-rose md:right-12 md:top-10" />
              <p className="font-script text-4xl text-rose-deep md:text-5xl">
                {fill(love.letter.greeting)}
              </p>
              {love.letter.paragraphs.map((p) => (
                <p key={p} className="font-letter text-lg italic leading-[1.8] md:text-[19px]">
                  {p}
                </p>
              ))}
              <div>
                <p className="font-letter text-lg text-muted">{love.letter.signOff}</p>
                <p className="font-script text-[44px] leading-tight text-rose">{love.yourName}</p>
              </div>
            </article>
          </div>
        </section>

        {/* The question */}
        <section
          className={`bg-gradient-to-b from-blush to-cream py-24 md:py-[120px] ${sectionX}`}
        >
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-8 text-center">
            <Heart size={64} className="animate-heartbeat text-rose" />
            <p className="font-script text-5xl text-rose">{love.question.intro}</p>
            <h2 className="max-w-[760px] font-display text-4xl font-bold leading-tight md:text-5xl">
              {love.question.ask}
            </h2>
            <Question
              yes={love.question.yes}
              no={love.question.no}
              answer={fill(love.question.answer)}
            />
          </div>
        </section>

        {/* Countdown */}
        <section id="countdown" className={`bg-white py-24 md:py-[120px] ${sectionX}`}>
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-16">
            <div className="reveal flex flex-col items-center gap-4 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose">
                Countdown
              </p>
              <h2 className="font-display text-4xl font-bold md:text-6xl">
                Until our next anniversary
              </h2>
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                <AnniversaryDate startDate={love.startDate} />. I am already planning something
                special.
              </p>
            </div>
            <LiveCounter startDate={love.startDate} mode="until" boxClassName="bg-cream" />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`bg-wine py-[72px] text-center ${sectionX}`}>
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4">
          <Logo light />
          <p className="text-blush">
            Made with all my love by {love.yourName}, for {love.herName}.
          </p>
          <p className="text-[13px] tracking-[0.1em] text-gold">
            Forever &amp; always · since{" "}
            {love.startDate.split("-").reverse().join(".")}
          </p>
        </div>
      </footer>
    </>
  );
}
