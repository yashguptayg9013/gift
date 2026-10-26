"use client";

import Link from "next/link";
import { useMemo } from "react";
import DecisionRow from "@/components/DecisionRow";
import { Button, ButtonLink, Card, CardTitle, Loading, Stat } from "@/components/ui";
import { evaluate } from "@/lib/engine";
import { journalStats } from "@/lib/journal";
import { loadExamples, useAppState, useHydrated } from "@/lib/store";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default function Dashboard() {
  const hydrated = useHydrated();
  const { decisions, settings } = useAppState();
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
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Decide better, then check your work.</h1>
        <p className="mt-3 text-muted">
          Enter a decision — <em>“Should I buy this MacBook?”</em>, <em>“Should I take this job?”</em> — and get a
          clear read on cost, long-term value, alternatives, opportunity cost and your own priorities. Every call goes
          into a journal so you can later see whether your reasoning held up.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/decisions/new">Make your first decision</ButtonLink>
          <Button variant="secondary" onClick={loadExamples}>
            Load examples
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Tip: set your savings and priorities in <Link href="/settings" className="underline">Settings</Link> first.
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
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">What&apos;s on your mind, and what&apos;s ready to look back on.</p>
        </div>
        <ButtonLink href="/decisions/new">+ New decision</ButtonLink>
      </div>

      {stats.dueForReview.length > 0 && (
        <Card className="border-warn/50 bg-warn-soft/40">
          <CardTitle hint="Time to compare what happened with what you expected.">
            {stats.dueForReview.length} decision{stats.dueForReview.length > 1 ? "s" : ""} ready for review
          </CardTitle>
          <div className="-mx-2">
            {stats.dueForReview.map((d) => (
              <DecisionRow key={d.id} decision={d} score={scores.get(d.id) ?? 0} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Decisions" value={stats.total} hint={`${stats.open} still open`} />
        <Stat label="Reviewed" value={stats.reviewed} />
        <Stat label="Sound reasoning" value={pct(stats.soundReasoningRate)} hint="right or unlucky" />
        <Stat label="Would repeat" value={pct(stats.wouldDecideSameRate)} />
      </div>

      <Card>
        <CardTitle hint="Still deliberating">Open decisions</CardTitle>
        {open.length === 0 ? (
          <p className="text-sm text-muted">Nothing open — enjoy the clarity.</p>
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
            <h2 className="font-semibold">Recently decided</h2>
            <Link href="/journal" className="text-sm text-accent hover:underline">
              Full journal →
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
