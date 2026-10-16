import {
  about,
  capabilities,
  domains,
  education,
  featuredProjects,
  moreProjects,
  profile,
  quote,
  skills,
  stats,
  type Project,
} from "./data";
import Reveal from "./components/Reveal";
import ThemeToggle from "./components/ThemeToggle";

const nav = [
  { href: "#about", label: "About" },
  { href: "#work", label: "Work" },
  { href: "#skills", label: "Skills" },
  { href: "#education", label: "Education" },
  { href: "#contact", label: "Contact" },
];

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

function Section({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="reveal grid gap-6 border-t border-line py-16 md:grid-cols-[9rem_1fr] md:gap-10 md:py-20">
      <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-subtle md:pt-1.5">{label}</h2>
      <div>{children}</div>
    </section>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <li key={t} className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">
          {t}
        </li>
      ))}
    </ul>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const href = p.live ?? p.code;
  return (
    <article className="group relative flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_8px_30px_-12px_var(--accent-soft)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          {p.label && (
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">{p.label}</p>
          )}
          <h3 className="text-lg font-medium leading-snug tracking-tight">
            <a href={href} target="_blank" rel="noopener noreferrer" className="after:absolute after:inset-0 after:rounded-2xl">
              {p.name}
            </a>
          </h3>
        </div>
        <Arrow className="mt-1 shrink-0 text-subtle group-hover:text-accent" />
      </div>
      <p className="text-[15px] leading-relaxed text-muted">{p.description}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <Tags tags={p.tags} />
        <div className="relative z-10 flex gap-4 font-mono text-xs">
          {p.code && (
            <a href={p.code} target="_blank" rel="noopener noreferrer" className="link text-muted hover:text-fg">
              Code
            </a>
          )}
          {p.live && (
            <a href={p.live} target="_blank" rel="noopener noreferrer" className="link text-accent">
              Live app
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <>
      <Reveal />

      <header className="sticky top-0 z-50 border-b border-line bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 font-medium tracking-tight">
            <span className="grid size-7 place-items-center rounded-full bg-fg font-serif text-sm text-bg">Y</span>
            <span className="hidden sm:inline">{profile.name}</span>
          </a>
          <nav className="flex items-center gap-1">
            <ul className="hidden items-center gap-1 md:flex">
              {nav.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-accent-soft hover:text-fg">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${profile.email}`}
              className="ml-1 rounded-full bg-fg px-3.5 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-85 md:hidden"
            >
              Contact
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Hero */}
        <section className="reveal pb-16 pt-20 sm:pt-28 md:pb-24">
          <p className="mb-6 inline-flex items-center gap-2.5 rounded-2xl border sm:rounded-full border-line bg-surface px-3 py-1 text-xs text-muted">
            <span className="pulse relative size-1.5 rounded-full bg-ok" />
            {profile.availability}
          </p>
          <h1 className="font-serif text-6xl leading-[0.95] tracking-tight sm:text-7xl md:text-8xl">
            {profile.name}
          </h1>
          <p className="mt-5 font-mono text-sm uppercase tracking-[0.16em] text-muted">{profile.role}</p>
          <p className="mt-8 max-w-2xl text-xl leading-relaxed text-fg/90 sm:text-2xl">
            <span className="font-serif text-2xl italic text-accent sm:text-[1.7rem]">{profile.tagline}</span>{" "}
            <span className="text-muted">{profile.intro}</span>
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${profile.email}`}
              className="rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-85"
            >
              Get in touch
            </a>
            <a
              href="#work"
              className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-fg/30 hover:bg-accent-soft"
            >
              See my work
            </a>
            <div className="ml-1 flex items-center gap-5 text-sm text-muted">
              <a href={profile.links.linkedin} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 hover:text-fg">
                LinkedIn <Arrow />
              </a>
              <a href={profile.links.github} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 hover:text-fg">
                GitHub <Arrow />
              </a>
            </div>
          </div>

          <dl className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-bg p-5 sm:p-6">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-serif text-4xl tracking-tight">{s.value}</dd>
                <dd className="mt-1 text-sm text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Section id="about" label="About">
          <div className="max-w-2xl space-y-5 text-[17px] leading-relaxed text-muted">
            {about.map((para) => (
              <p key={para.slice(0, 24)}>{para}</p>
            ))}
          </div>
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {capabilities.map((c, i) => (
              <div key={c.title} className="flex gap-4">
                <span className="pt-0.5 font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-medium tracking-tight">{c.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-subtle">Domains</p>
            <p className="font-serif text-2xl leading-snug sm:text-3xl">
              {domains.map((d, i) => (
                <span key={d}>
                  {d}
                  {i < domains.length - 1 && <span className="mx-2 text-subtle">/</span>}
                </span>
              ))}
            </p>
          </div>
        </Section>

        <Section id="work" label="Selected work">
          <div className="grid gap-4 lg:grid-cols-2">
            {featuredProjects.map((p) => (
              <ProjectCard key={p.name} p={p} />
            ))}
          </div>

          <h3 className="mb-2 mt-16 font-mono text-xs uppercase tracking-[0.14em] text-subtle">More analysis</h3>
          <ul>
            {moreProjects.map((p) => (
              <li key={p.name} className="border-b border-line last:border-b-0">
                <a
                  href={p.code}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group grid gap-1 py-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
                >
                  <div>
                    <p className="flex items-center gap-1.5 font-medium tracking-tight group-hover:text-accent">
                      {p.name}
                      <Arrow className="text-subtle group-hover:text-accent" />
                    </p>
                    <p className="mt-1 text-sm text-muted">{p.description}</p>
                  </div>
                  <p className="font-mono text-[11px] text-subtle">{p.tags.join(" · ")}</p>
                </a>
              </li>
            ))}
          </ul>
          <a
            href={`${profile.links.github}?tab=repositories`}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-6 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            All repositories on GitHub <Arrow />
          </a>
        </Section>

        <Section id="skills" label="Toolkit">
          <dl className="divide-y divide-line">
            {skills.map((s) => (
              <div key={s.group} className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="text-sm font-medium">{s.group}</dt>
                <dd className="text-[15px] leading-relaxed text-muted">{s.items.join(", ")}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="education" label="Education">
          <ol className="space-y-10">
            {education.map((e) => (
              <li key={e.degree} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-6">
                <div>
                  <h3 className="text-lg font-medium tracking-tight">{e.degree}</h3>
                  <p className="mt-0.5 text-muted">
                    {e.school} <span className="text-subtle">·</span> <span className="text-fg/80">{e.result}</span>
                  </p>
                  {e.note && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{e.note}</p>}
                </div>
                <p className="font-mono text-xs text-subtle sm:pt-1.5">{e.years}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="contact" label="Contact">
          <p className="font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl">
            Let&apos;s turn your data
            <br />
            into <em className="text-accent">decisions.</em>
          </p>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
            I&apos;m always open to collaborating on data projects, talking analytics, or exploring new roles.
            Based in {profile.location} — open to remote and hybrid opportunities globally.
          </p>
          <a
            href={`mailto:${profile.email}`}
            className="group mt-8 inline-flex items-center gap-2 break-all text-xl font-medium tracking-tight sm:text-2xl"
          >
            <span className="link">{profile.email}</span>
            <Arrow className="size-4 text-accent" />
          </a>
          <div className="mt-6 flex gap-6 text-sm text-muted">
            <a href={profile.links.linkedin} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 hover:text-fg">
              LinkedIn <Arrow />
            </a>
            <a href={profile.links.github} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 hover:text-fg">
              GitHub <Arrow />
            </a>
          </div>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-10 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-serif text-base italic text-muted">
            “{quote.text}” <span className="not-italic text-subtle">— {quote.author}</span>
          </p>
          <p className="font-mono text-xs">
            © {year} {profile.name}
          </p>
        </div>
      </footer>
    </>
  );
}
