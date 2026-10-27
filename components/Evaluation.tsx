"use client";

import Link from "next/link";
import { formatMoney, formatNumber, totalCost, utility, type Evaluation, type Insight } from "@/lib/engine";
import { useT } from "@/lib/store";
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
  const t = useT();
  return (
    <Card className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <ScoreRing score={ev.score} />
      <div className="flex-1 text-center sm:text-left">
        <Badge tone={ev.recommendation.tone}>{ev.recommendation.label}</Badge>
        <p className="mt-2 text-sm">{ev.recommendation.blurb}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted sm:justify-start">
          <span>{t.report.yourGut(decision.gutFeeling)}</span>
          <span>{t.report.completeness(ev.completeness)}</span>
          {decision.scoreAtDecision !== undefined && decision.scoreAtDecision !== ev.score && (
            <span>{t.report.scoreWhenDecided(decision.scoreAtDecision)}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

export function DimensionBreakdown({ ev }: { ev: Evaluation }) {
  const t = useT();
  return (
    <Card>
      <CardTitle hint={t.report.howItAddsUpHint}>{t.report.howItAddsUp}</CardTitle>
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
  const t = useT();
  if (!insights.length) return null;
  return (
    <Card>
      <CardTitle>{t.report.thingsToConsider}</CardTitle>
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
  const t = useT();
  const fmt = (n: number) => formatMoney(n, settings.profile.currency, settings.locale);
  const f = ev.financials;
  const gain = f.totalCost < 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        label={gain ? t.report.netGain : t.report.totalCost}
        value={fmt(Math.abs(f.totalCost))}
        hint={t.report.overYears(decision.horizonYears)}
      />
      <Stat label={gain ? t.report.gainPerYear : t.report.costPerYear} value={fmt(Math.abs(f.costPerYear))} />
      <Stat
        label={t.report.ifInvested}
        value={gain || f.totalCost === 0 ? "—" : fmt(f.investedValue)}
        hint={t.report.atRate(settings.profile.investmentReturn)}
      />
      <Stat
        label={t.report.lifeHours}
        value={formatNumber(Math.round(f.totalHours), settings.locale)}
        hint={
          f.workHours > 0
            ? t.report.lifeHoursSplit(Math.round(f.workHours), decision.timeCostHours)
            : t.report.lifeHoursHint
        }
      />
    </div>
  );
}

export function AlternativesTable({ decision, settings }: { decision: Decision; settings: Settings }) {
  const t = useT();
  if (!decision.alternatives.length) return null;
  const fmt = (n: number) => formatMoney(n, settings.profile.currency, settings.locale);
  const budget = settings.profile.monthlySavings;
  const rows = [
    { id: "main", name: t.report.thisOption, upfrontCost: decision.upfrontCost, monthlyCost: decision.monthlyCost, value: decision.longTermValue },
    ...decision.alternatives,
  ].map((r) => ({
    ...r,
    total: totalCost(r.upfrontCost, r.monthlyCost, decision.horizonYears),
    utility: Math.round(utility(r.value, r.upfrontCost, r.monthlyCost, budget)),
  }));
  const bestUtility = Math.max(...rows.map((r) => r.utility));

  return (
    <Card>
      <CardTitle hint={t.report.altComparedHint(decision.horizonYears)}>{t.report.altCompared}</CardTitle>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">{t.report.colOption}</th>
              <th className="pb-2 text-right font-medium">{t.report.colTotal}</th>
              <th className="pb-2 text-right font-medium">{t.report.colValue}</th>
              <th className="pb-2 text-right font-medium">{t.report.colWorth}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-border ${r.id === "main" ? "font-medium" : ""}`}>
                <td className="py-2">
                  {r.name || t.common.untitled}
                  {r.utility === bestUtility && (
                    <span className="ml-2">
                      <Badge tone="good">{t.report.best}</Badge>
                    </span>
                  )}
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
  const t = useT();
  if (!decision.pros.length && !decision.cons.length) return null;
  const weightLabel = t.form.weights;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {(["pros", "cons"] as const).map((k) => (
        <Card key={k}>
          <CardTitle>{k === "pros" ? t.form.pros : t.form.cons}</CardTitle>
          {decision[k].length === 0 ? (
            <p className="text-sm text-muted">{t.common.noneListed}</p>
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

export function SimilarDecisions({ ev, settings }: { ev: Evaluation; settings: Settings }) {
  const t = useT();
  if (!ev.similar.length) return null;
  return (
    <Card>
      <CardTitle hint={t.report.similarHint}>{t.report.similarTitle}</CardTitle>
      <ul className="divide-y divide-border">
        {ev.similar.map(({ decision: h, reason }) => (
          <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
            <Link href={`/decisions/${h.id}`} className="flex items-center gap-3 hover:text-accent">
              {h.scoreAtDecision !== undefined && <ScorePill score={h.scoreAtDecision} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{h.title}</div>
                <div className="text-xs text-muted">
                  {reason} · {formatDate(h.createdAt, settings.locale)}
                  {h.choice && ` · ${t.report.chose(t.choice.short[h.choice])}`}
                </div>
              </div>
              {h.review ? (
                <Badge tone={h.review.outcome >= 4 ? "good" : h.review.outcome <= 2 ? "bad" : "info"}>
                  {t.outcome(h.review.outcome)}
                </Badge>
              ) : (
                <Badge tone="info">{t.status[h.status]}</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
