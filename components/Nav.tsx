"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/journal", label: "Journal" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="text-xl">🧠</span>
          <span className="hidden sm:inline">Decision Engine</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                  active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/decisions/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + New
        </Link>
      </div>
    </header>
  );
}
