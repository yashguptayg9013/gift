"use client";

import Link from "next/link";
import { useMemo } from "react";
import DecisionRow from "@/components/DecisionRow";
import { Button, ButtonLink, Card, CardTitle, Loading, Stat } from "@/components/ui";
import { evaluate } from "@/lib/engine";
import { journalStats } from "@/lib/journal";
import { loadExamples, useAppState, useHydrated, useT } from "@/lib/store";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default function Dashboard() {
  const hydrated = useHydrated();
  const { decisions, settings } = useAppState();
  const t = useT();
  const stats = useMemo(() => journalStats(decisions), [decisions]);
  const scores = useMemo(
    () => new Map(decisions.map((d) => [d.id, evaluate(d, settings, decisions).score])),
    [decisions, settings],
  );

  if (!hydrated) return <Loading />;

  if (decisions.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <div className="text-5xl" aria-hidden>
          🧠
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t.dashboard.heroTitle}</h1>
        <p className="mt-3 text-muted">{t.dashboard.heroBody}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/decisions/new">{t.dashboard.firstDecision}</ButtonLink>
          <Button variant="secondary" onClick={loadExamples}>
            {t.dashboard.loadExamples}
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">
          {t.dashboard.tipBefore}
          <Link href="/settings" className="underline">
            {t.nav.settings}
          </Link>
          {t.dashboard.tipAfter}
        </p>
      </div>
    );
  }

  const open = decisions.filter((d) => d.status === "open");
  const recent = decisions
    .filter((d) => d.status !== "open")
    .sort((a, b) => (b.decidedAt ?? b.updatedAt).localeCompare(a.decidedAt ?? a.updatedAt))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
          <p className="text-sm text-muted">{t.dashboard.subtitle}</p>
        </div>
        <ButtonLink href="/decisions/new">{t.dashboard.newDecision}</ButtonLink>
      </div>

      {stats.dueForReview.length > 0 && (
        <Card className="border-warn/50 bg-warn-soft/40">
          <CardTitle hint={t.dashboard.readyHint}>{t.dashboard.readyForReview(stats.dueForReview.length)}</CardTitle>
          <div className="-mx-2">
            {stats.dueForReview.map((d) => (
              <DecisionRow key={d.id} decision={d} score={scores.get(d.id) ?? 0} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.dashboard.statDecisions} value={stats.total} hint={t.dashboard.statOpen(stats.open)} />
        <Stat label={t.dashboard.statReviewed} value={stats.reviewed} />
        <Stat label={t.dashboard.statSound} value={pct(stats.soundReasoningRate)} hint={t.dashboard.statSoundHint} />
        <Stat label={t.dashboard.statRepeat} value={pct(stats.wouldDecideSameRate)} />
      </div>

      <Card>
        <CardTitle hint={t.dashboard.openHint}>{t.dashboard.openTitle}</CardTitle>
        {open.length === 0 ? (
          <p className="text-sm text-muted">{t.dashboard.nothingOpen}</p>
        ) : (
          <div className="-mx-2">
            {open.map((d) => (
              <DecisionRow key={d.id} decision={d} score={scores.get(d.id) ?? 0} />
            ))}
          </div>
        )}
      </Card>

      {recent.length > 0 && (
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">{t.dashboard.recent}</h2>
            <Link href="/journal" className="text-sm text-accent hover:underline">
              {t.dashboard.fullJournal}
            </Link>
          </div>
          <div className="-mx-2">
            {recent.map((d) => (
              <DecisionRow key={d.id} decision={d} score={scores.get(d.id) ?? 0} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
