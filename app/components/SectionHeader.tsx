export function SectionHeader({
  eyebrow,
  title,
  sub,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  dark?: boolean;
}) {
  return (
    <div className="reveal flex flex-col items-center gap-4 text-center">
      <p
        className={`text-sm font-semibold uppercase tracking-[0.2em] ${dark ? "text-gold" : "text-rose"}`}
      >
        {eyebrow}
      </p>
      <h2
        className={`font-display text-4xl font-bold md:text-6xl ${dark ? "text-white" : "text-wine"}`}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={`max-w-xl text-lg leading-relaxed ${dark ? "text-blush" : "text-muted"}`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
