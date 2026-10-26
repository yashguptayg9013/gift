"use client";

import Link from "next/link";
import { formatMoney, totalCost, utility, type Evaluation, type Insight } from "@/lib/engine";
import type { Decision, Settings } from "@/lib/types";
import { Badge, Card, CardTitle, ScoreBar, ScorePill, ScoreRing, Stat, formatDate } from "./ui";

const INSIGHT_ICON: Record<Insight["tone"], string> = { good: "✓", warn: "!", bad: "✕", info: "i" };
const INSIGHT_STYLE: Record<Insight["tone"], string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};

export function EvaluationSummary({ decision, ev }: { decision: Decision; ev: Evaluation }) {
  return (
    <Card className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <ScoreRing score={ev.score} />
      <div className="flex-1 text-center sm:text-left">
        <Badge tone={ev.recommendation.tone}>{ev.recommendation.label}</Badge>
        <p className="mt-2 text-sm">{ev.recommendation.blurb}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted sm:justify-start">
          <span>Your gut: {decision.gutFeeling}/100</span>
          <span>Analysis {ev.completeness}% complete</span>
          {decision.scoreAtDecision !== undefined && decision.scoreAtDecision !== ev.score && (
            <span>Score when decided: {decision.scoreAtDecision}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

export function DimensionBreakdown({ ev }: { ev: Evaluation }) {
  return (
    <Card>
      <CardTitle hint="Dashed bars have no input yet and don't count toward the score.">How it adds up</CardTitle>
      <ul className="space-y-4">
        {ev.dimensions.map((dim) => (
          <li key={dim.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{dim.label}</span>
              <span className="font-mono tabular-nums text-muted">{dim.score === null ? "—" : Math.round(dim.score)}</span>
            </div>
            <ScoreBar score={dim.score === null ? null : Math.round(dim.score)} />
            <p className="mt-1 text-xs text-muted">{dim.summary}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <Card>
      <CardTitle>Things to consider</CardTitle>
      <ul className="space-y-2.5">
        {insights.map((i, idx) => (
          <li key={idx} className="flex gap-2.5 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${INSIGHT_STYLE[i.tone]}`}
            >
              {INSIGHT_ICON[i.tone]}
            </span>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MoneyPanel({ decision, ev, settings }: { decision: Decision; ev: Evaluation; settings: Settings }) {
  const fmt = (n: number) => formatMoney(n, settings.profile.currency);
  const f = ev.financials;
  const gain = f.totalCost < 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        label={gain ? "Net gain" : "Total cost"}
        value={fmt(Math.abs(f.totalCost))}
        hint={`over ${decision.horizonYears} yr`}
      />
      <Stat label={gain ? "Gain / year" : "Cost / year"} value={fmt(Math.abs(f.costPerYear))} />
      <Stat
        label="If invested"
        value={gain || f.totalCost === 0 ? "—" : fmt(f.investedValue)}
        hint={`at ${settings.profile.investmentReturn}%/yr`}
      />
      <Stat
        label="Life hours"
        value={Math.round(f.totalHours).toLocaleString()}
        hint={f.workHours > 0 ? `${Math.round(f.workHours)} h work + ${decision.timeCostHours} h time` : "time it takes"}
      />
    </div>
  );
}

export function AlternativesTable({ decision, settings }: { decision: Decision; settings: Settings }) {
  if (!decision.alternatives.length) return null;
  const fmt = (n: number) => formatMoney(n, settings.profile.currency);
  const budget = settings.profile.monthlySavings;
  const rows = [
    { id: "main", name: "This option", upfrontCost: decision.upfrontCost, monthlyCost: decision.monthlyCost, value: decision.longTermValue },
    ...decision.alternatives,
  ].map((r) => ({
    ...r,
    total: totalCost(r.upfrontCost, r.monthlyCost, decision.horizonYears),
    utility: Math.round(utility(r.value, r.upfrontCost, r.monthlyCost, budget)),
  }));
  const bestUtility = Math.max(...rows.map((r) => r.utility));

  return (
    <Card>
      <CardTitle hint={`Worth-it score blends value with affordability, over ${decision.horizonYears} years.`}>
        Alternatives compared
      </CardTitle>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">Option</th>
              <th className="pb-2 text-right font-medium">Total cost</th>
              <th className="pb-2 text-right font-medium">Value</th>
              <th className="pb-2 text-right font-medium">Worth-it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-border ${r.id === "main" ? "font-medium" : ""}`}>
                <td className="py-2">
                  {r.name || "Untitled"}
                  {r.utility === bestUtility && <span className="ml-2"><Badge tone="good">best</Badge></span>}
                </td>
                <td className="py-2 text-right tabular-nums">{fmt(r.total)}</td>
                <td className="py-2 text-right tabular-nums">{r.value}/10</td>
                <td className="py-2 text-right tabular-nums">{r.utility}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ProsCons({ decision }: { decision: Decision }) {
  if (!decision.pros.length && !decision.cons.length) return null;
  const weightLabel = ["", "minor", "notable", "major"];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {(["pros", "cons"] as const).map((k) => (
        <Card key={k}>
          <CardTitle>{k === "pros" ? "Pros" : "Cons"}</CardTitle>
          {decision[k].length === 0 ? (
            <p className="text-sm text-muted">None listed.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {[...decision[k]]
                .sort((a, b) => b.weight - a.weight)
                .map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className={k === "pros" ? "text-good" : "text-bad"}>{k === "pros" ? "+" : "−"}</span> {a.text}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{weightLabel[a.weight]}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

export function SimilarDecisions({ ev }: { ev: Evaluation }) {
  if (!ev.similar.length) return null;
  return (
    <Card>
      <CardTitle hint="From your journal">Similar past decisions</CardTitle>
      <ul className="divide-y divide-border">
        {ev.similar.map(({ decision: h, reason }) => (
          <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
            <Link href={`/decisions/${h.id}`} className="flex items-center gap-3 hover:text-accent">
              {h.scoreAtDecision !== undefined && <ScorePill score={h.scoreAtDecision} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{h.title}</div>
                <div className="text-xs text-muted">
                  {reason} · {formatDate(h.createdAt)}
                  {h.choice && ` · chose ${h.choice}`}
                </div>
              </div>
              {h.review ? (
                <Badge tone={h.review.outcome >= 4 ? "good" : h.review.outcome <= 2 ? "bad" : "info"}>
                  outcome {h.review.outcome}/5
                </Badge>
              ) : (
                <Badge tone="info">{h.status}</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
