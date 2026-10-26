"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DecisionRow from "@/components/DecisionRow";
import { Card, CardTitle, Loading, Stat, TextInput, inputClass } from "@/components/ui";
import { evaluate } from "@/lib/engine";
import { journalStats } from "@/lib/journal";
import { useAppState, useHydrated } from "@/lib/store";
import { CATEGORIES, type Category, type Decision } from "@/lib/types";

type StatusFilter = "all" | Decision["status"];

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function describeCorrelation(r: number | null) {
  if (r === null) return "Needs 3+ reviewed decisions you acted on";
  if (r >= 0.5) return "Strongly predicts outcomes";
  if (r >= 0.2) return "Somewhat predicts outcomes";
  if (r > -0.2) return "No real link to outcomes";
  return "Points the wrong way";
}

export default function JournalPage() {
  const hydrated = useHydrated();
  const { decisions, settings } = useAppState();
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

  const fmt = (r: number | null) => (r === null ? "—" : r.toFixed(2));
  const gutWins =
    stats.engineCalibration !== null &&
    stats.gutCalibration !== null &&
    stats.gutCalibration > stats.engineCalibration + 0.1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Decision journal</h1>
        <p className="text-sm text-muted">Every call you&apos;ve made, and how good your reasoning turned out to be.</p>
      </div>

      <Card>
        <CardTitle hint="Gets sharper with every decision you review.">What your journal says</CardTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Avg outcome" value={stats.avgOutcome === null ? "—" : `${stats.avgOutcome.toFixed(1)}/5`} />
          <Stat label="Sound reasoning" value={pct(stats.soundReasoningRate)} hint="right + unlucky" />
          <Stat label="Engine accuracy" value={pct(stats.engineHitRate)} hint="its lean matched hindsight" />
          <Stat label="Would repeat" value={pct(stats.wouldDecideSameRate)} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Engine score vs outcome</div>
            <div className="mt-1 font-mono text-lg">{fmt(stats.engineCalibration)}</div>
            <div className="text-xs text-muted">{describeCorrelation(stats.engineCalibration)}</div>
          </div>
          <div className="rounded-lg bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Gut feeling vs outcome</div>
            <div className="mt-1 font-mono text-lg">{fmt(stats.gutCalibration)}</div>
            <div className="text-xs text-muted">{describeCorrelation(stats.gutCalibration)}</div>
          </div>
        </div>
        {stats.engineCalibration !== null && stats.gutCalibration !== null && (
          <p className="mt-3 text-sm">
            {gutWins
              ? "Your gut has been a better predictor than the structured analysis — your inputs may be missing something you sense intuitively."
              : "The structured analysis has predicted outcomes at least as well as your gut. Keep writing things down."}
          </p>
        )}

        {stats.byCategory.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">By category</div>
            <ul className="space-y-1.5">
              {stats.byCategory.map((c) => {
                const meta = CATEGORIES.find((x) => x.value === c.category)!;
                return (
                  <li key={c.category} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0">
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${c.avgOutcome === null ? 0 : ((c.avgOutcome - 1) / 4) * 100}%` }}
                      />
                    </div>
                    <span className="w-36 shrink-0 text-right text-xs text-muted">
                      {c.count} total ·{" "}
                      {c.avgOutcome === null ? "no reviews" : `avg ${c.avgOutcome.toFixed(1)}/5`}
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
          <CardTitle>Lessons learned</CardTitle>
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
          <TextInput placeholder="Search decisions…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={`${inputClass} sm:w-auto`}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="decided">Decided</option>
            <option value="reviewed">Reviewed</option>
          </select>
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
            className={`${inputClass} sm:w-auto`}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {decisions.length === 0 ? (
              <>
                No decisions yet. <Link href="/decisions/new" className="text-accent underline">Start one</Link>.
              </>
            ) : (
              "No decisions match these filters."
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
