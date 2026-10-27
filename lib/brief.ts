import { formatMoney, type Evaluation } from "./engine";
import type { Decision, Settings } from "./types";

/** Upper bound the API route accepts; the brief for a very detailed decision stays well under it. */
export const MAX_BRIEF_CHARS = 20000;

const IMPACT = ["strongly hurts", "hurts", "no effect", "helps", "strongly helps"];
const WEIGHT = ["", "minor", "notable", "major"];
const REVERSIBILITY = ["", "permanent", "hard to undo", "undoable at a cost", "easy to undo", "trivially reversible"];

/**
 * Plain-text summary of one decision and the engine's analysis, sent to Claude for a second opinion.
 * Only this decision, the user's profile/priorities and up to three similar past decisions are included —
 * never the rest of the journal.
 */
export function buildBrief(d: Decision, settings: Settings, ev: Evaluation): string {
  const { profile, priorities } = settings;
  const fmt = (n: number) => formatMoney(n, profile.currency);
  const f = ev.financials;
  const lines: string[] = [];
  const section = (title: string) => lines.push("", `## ${title}`);

  lines.push(`# Decision: ${d.title}`, `Category: ${d.category}`);
  if (d.context.trim()) lines.push(`Context: ${d.context.trim()}`);
  lines.push(`Gut feeling before analysis: ${d.gutFeeling}/100 (0 = definitely not, 100 = definitely yes)`);

  section("Money and time");
  lines.push(
    `Upfront cost: ${fmt(d.upfrontCost)}; monthly cost: ${fmt(d.monthlyCost)} (negative means money gained)`,
    `Time horizon: ${d.horizonYears} years; total over horizon: ${fmt(f.totalCost)}`,
    `Hours of the person's time it takes: ${d.timeCostHours}; hours of work to pay for it: ${Math.round(f.workHours)}`,
    `Person's monthly savings capacity: ${fmt(profile.monthlySavings)}; take-home pay per hour: ${fmt(profile.hourlyIncome)}; expected investment return: ${profile.investmentReturn}%/yr`,
  );
  if (f.totalCost > 0) lines.push(`If invested instead, the money would be worth ${fmt(f.investedValue)} after the horizon.`);

  section("Value");
  lines.push(
    `Expected long-term value: ${d.longTermValue}/10`,
    `Reversibility: ${d.reversibility}/5 (${REVERSIBILITY[d.reversibility] ?? "unknown"})`,
  );

  section("Alternatives listed");
  if (d.alternatives.length === 0) lines.push("None.");
  for (const a of d.alternatives) {
    lines.push(`- ${a.name || "Untitled"}: upfront ${fmt(a.upfrontCost)}, monthly ${fmt(a.monthlyCost)}, value ${a.value}/10`);
  }

  section("Personal priorities (importance 1-5) and this decision's effect");
  for (const p of [...priorities].sort((a, b) => b.weight - a.weight)) {
    const impact = d.priorityImpacts[p.id] ?? 0;
    lines.push(`- ${p.name} (importance ${p.weight}): ${IMPACT[impact + 2]}`);
  }

  section("Pros");
  lines.push(...(d.pros.length ? d.pros.map((a) => `- ${a.text} (${WEIGHT[a.weight]})`) : ["None listed."]));
  section("Cons");
  lines.push(...(d.cons.length ? d.cons.map((a) => `- ${a.text} (${WEIGHT[a.weight]})`) : ["None listed."]));

  section("Structured engine's analysis");
  lines.push(`Overall score: ${ev.score}/100 — ${ev.recommendation.label}. ${ev.recommendation.blurb}`);
  for (const dim of ev.dimensions) {
    lines.push(`- ${dim.label}: ${dim.score === null ? "not scored" : Math.round(dim.score)} — ${dim.summary}`);
  }
  if (ev.insights.length) {
    lines.push("Flags raised:", ...ev.insights.map((i) => `- ${i.text}`));
  }

  const past = ev.similar.filter((s) => s.decision.status !== "open");
  if (past.length) {
    section("Similar past decisions from the person's journal");
    for (const { decision: h } of past) {
      const parts = [`- "${h.title}": chose ${h.choice ?? "nothing yet"}`];
      if (h.rationale) parts.push(`reasoning: ${h.rationale}`);
      if (h.review) {
        parts.push(
          `outcome ${h.review.outcome}/5`,
          h.review.wouldDecideSame ? "would decide the same" : "would decide differently",
          `reasoning judged ${h.review.verdict}`,
        );
        if (h.review.lessons) parts.push(`lesson: ${h.review.lessons}`);
      }
      lines.push(parts.join("; "));
    }
  }

  return lines.join("\n");
}
