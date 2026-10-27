"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getDict, isLocale, LOCALES } from "@/lib/i18n";
import { saveSettings, useAppState } from "@/lib/store";

export function LanguageSelect({ className = "" }: { className?: string }) {
  const { settings } = useAppState();
  const t = getDict(settings.locale);
  return (
    <select
      aria-label={t.common.language}
      value={settings.locale}
      onChange={(e) => {
        if (isLocale(e.target.value)) saveSettings({ ...settings, locale: e.target.value });
      }}
      className={className}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {getDict(l).languageName}
        </option>
      ))}
    </select>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const { settings } = useAppState();
  const t = getDict(settings.locale);

  // Keep <html lang> in step with the chosen language for screen readers and hyphenation.
  useEffect(() => {
    document.documentElement.lang = settings.locale;
  }, [settings.locale]);

  const links = [
    { href: "/", label: t.nav.dashboard, icon: "🏠" },
    { href: "/journal", label: t.nav.journal, icon: "📓" },
    { href: "/settings", label: t.nav.settings, icon: "⚙️" },
  ];

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="text-xl">🧠</span>
          <span className="hidden md:inline">{t.nav.appName}</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 text-sm">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-label={l.label}
                title={l.label}
                className={`rounded-md px-2 py-1.5 transition-colors ${
                  active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-foreground"
                }`}
              >
                {/* Icons on phones, where translated labels don't fit; words from the sm breakpoint up. */}
                <span aria-hidden className="sm:hidden">
                  {l.icon}
                </span>
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <LanguageSelect className="hidden rounded-md border border-border bg-surface px-1.5 py-1 text-sm text-muted sm:block" />
        <Link
          href="/decisions/new"
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {t.nav.new}
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  const t = getDict(useAppState().settings.locale);
  return (
    <footer className="mx-auto w-full max-w-4xl px-4 pb-8 text-xs text-muted sm:px-6">{t.common.footer}</footer>
  );
}
