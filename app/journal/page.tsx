"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DecisionRow from "@/components/DecisionRow";
import { Card, CardTitle, Loading, Stat, TextInput, inputClass } from "@/components/ui";
import { evaluate, formatNumber } from "@/lib/engine";
import type { Dict } from "@/lib/i18n";
import { journalStats } from "@/lib/journal";
import { useAppState, useHydrated, useT } from "@/lib/store";
import { CATEGORIES, type Category, type Decision } from "@/lib/types";

type StatusFilter = "all" | Decision["status"];

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function describeCorrelation(r: number | null, t: Dict) {
  if (r === null) return t.journal.corrNeedsData;
  if (r >= 0.5) return t.journal.corrStrong;
  if (r >= 0.2) return t.journal.corrSome;
  if (r > -0.2) return t.journal.corrNone;
  return t.journal.corrWrong;
}

export default function JournalPage() {
  const hydrated = useHydrated();
  const { decisions, settings } = useAppState();
  const t = useT();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");

  const stats = useMemo(() => journalStats(decisions), [decisions]);
  const scores = useMemo(
    () => new Map(decisions.map((d) => [d.id, evaluate(d, settings, decisions).score])),
    [decisions, settings],
  );

  const filtered = decisions
    .filter((d) => status === "all" || d.status === status)
    .filter((d) => category === "all" || d.category === category)
    .filter((d) => {
      const q = query.trim().toLowerCase();
      return !q || `${d.title} ${d.context} ${d.rationale ?? ""}`.toLowerCase().includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!hydrated) return <Loading />;

  const { locale } = settings;
  const fmt = (r: number | null) => (r === null ? "—" : formatNumber(r, locale, 2));
  const gutWins =
    stats.engineCalibration !== null &&
    stats.gutCalibration !== null &&
    stats.gutCalibration > stats.engineCalibration + 0.1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.journal.title}</h1>
        <p className="text-sm text-muted">{t.journal.subtitle}</p>
      </div>

      <Card>
        <CardTitle hint={t.journal.saysHint}>{t.journal.saysTitle}</CardTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label={t.journal.avgOutcome}
            value={stats.avgOutcome === null ? "—" : `${formatNumber(stats.avgOutcome, locale, 1)}/5`}
          />
          <Stat label={t.journal.sound} value={pct(stats.soundReasoningRate)} hint={t.journal.soundHint} />
          <Stat label={t.journal.engineAccuracy} value={pct(stats.engineHitRate)} hint={t.journal.engineAccuracyHint} />
          <Stat label={t.journal.repeat} value={pct(stats.wouldDecideSameRate)} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{t.journal.engineVsOutcome}</div>
            <div className="mt-1 font-mono text-lg">{fmt(stats.engineCalibration)}</div>
            <div className="text-xs text-muted">{describeCorrelation(stats.engineCalibration, t)}</div>
          </div>
          <div className="rounded-lg bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{t.journal.gutVsOutcome}</div>
            <div className="mt-1 font-mono text-lg">{fmt(stats.gutCalibration)}</div>
            <div className="text-xs text-muted">{describeCorrelation(stats.gutCalibration, t)}</div>
          </div>
        </div>
        {stats.engineCalibration !== null && stats.gutCalibration !== null && (
          <p className="mt-3 text-sm">{gutWins ? t.journal.gutWins : t.journal.engineWins}</p>
        )}

        {stats.byCategory.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">{t.journal.byCategory}</div>
            <ul className="space-y-1.5">
              {stats.byCategory.map((c) => {
                const meta = CATEGORIES.find((x) => x.value === c.category)!;
                return (
                  <li key={c.category} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate">
                      {meta.emoji} {t.categories[meta.value]}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${c.avgOutcome === null ? 0 : ((c.avgOutcome - 1) / 4) * 100}%` }}
                      />
                    </div>
                    <span className="w-36 shrink-0 text-right text-xs text-muted">
                      {t.journal.catSummary(
                        c.count,
                        c.avgOutcome === null ? null : formatNumber(c.avgOutcome, locale, 1),
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      {stats.lessons.length > 0 && (
        <Card>
          <CardTitle>{t.journal.lessonsTitle}</CardTitle>
          <ul className="space-y-3">
            {stats.lessons.slice(0, 6).map(({ decision, lesson }) => (
              <li key={decision.id} className="border-l-2 border-accent pl-3">
                <p className="text-sm">{lesson}</p>
                <Link href={`/decisions/${decision.id}`} className="text-xs text-muted hover:text-accent">
                  {decision.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <TextInput placeholder={t.journal.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select
            aria-label={t.journal.status}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={`${inputClass} sm:w-auto`}
          >
            <option value="all">{t.journal.allStatuses}</option>
            <option value="open">{t.journal.statusOptions.open}</option>
            <option value="decided">{t.journal.statusOptions.decided}</option>
            <option value="reviewed">{t.journal.statusOptions.reviewed}</option>
          </select>
          <select
            aria-label={t.form.category}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
            className={`${inputClass} sm:w-auto`}
          >
            <option value="all">{t.journal.allCategories}</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {t.categories[c.value]}
              </option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {decisions.length === 0 ? (
              <>
                {t.journal.emptyBefore}
                <Link href="/decisions/new" className="text-accent underline">
                  {t.journal.emptyLink}
                </Link>
                .
              </>
            ) : (
              t.journal.noMatch
            )}
          </p>
        ) : (
          <div className="-mx-2 divide-y divide-border">
            {filtered.map((d) => (
              <DecisionRow key={d.id} decision={d} score={scores.get(d.id) ?? 0} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
