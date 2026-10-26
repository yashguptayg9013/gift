import type { Alternative, Decision, Settings } from "./types";

export type DimensionKey =
  | "cost"
  | "value"
  | "alternatives"
  | "opportunity"
  | "priorities"
  | "prosCons"
  | "history";

export interface Dimension {
  key: DimensionKey;
  label: string;
  /** 0-100, or null when there isn't enough information to judge. */
  score: number | null;
  weight: number;
  summary: string;
}

export type Tone = "good" | "warn" | "bad" | "info";

export interface Insight {
  tone: Tone;
  text: string;
}

export interface Recommendation {
  label: string;
  tone: Tone;
  blurb: string;
}

export interface Financials {
  totalCost: number;
  costPerYear: number;
  /** What the money would have grown to if invested over the horizon. */
  investedValue: number;
  /** investedValue minus totalCost: growth you give up. */
  foregoneGrowth: number;
  /** Hours you have to work to pay for it. */
  workHours: number;
  /** Work hours + the decision's own time cost. */
  totalHours: number;
  /** Upfront cost expressed as months of savings. */
  monthsOfSavings: number | null;
}

export interface SimilarDecision {
  decision: Decision;
  reason: string;
}

export interface Evaluation {
  score: number;
  recommendation: Recommendation;
  dimensions: Dimension[];
  insights: Insight[];
  financials: Financials;
  bestAlternative?: { alternative: Alternative; utility: number };
  similar: SimilarDecision[];
  /** 0-100: how much of the picture you've filled in. */
  completeness: number;
}

const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  cost: 1,
  value: 1.3,
  alternatives: 0.8,
  opportunity: 0.7,
  priorities: 1.3,
  prosCons: 1,
  history: 0.6,
};

/** Monthly discretionary budget assumed when the profile doesn't set one. */
const FALLBACK_MONTHLY_BUDGET = 1000;
/** A month of full-time work. */
const WORK_MONTH_HOURS = 160;

export const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n);

export function totalCost(upfront: number, monthly: number, horizonYears: number) {
  return upfront + monthly * 12 * Math.max(horizonYears, 0);
}

/** Future value of the upfront amount plus the monthly stream, invested at `annualPct`. */
export function futureValue(
  upfront: number,
  monthly: number,
  horizonYears: number,
  annualPct: number,
) {
  const months = Math.max(0, Math.round(horizonYears * 12));
  const r = annualPct / 100 / 12;
  if (r === 0) return upfront + monthly * months;
  const growth = Math.pow(1 + r, months);
  return upfront * growth + monthly * ((growth - 1) / r);
}

/**
 * Affordability, 0-100. A cost equal to three months of savings scores 50;
 * recurring costs eat into what's left proportionally.
 */
export function affordability(upfront: number, monthly: number, monthlyBudget: number) {
  if (upfront <= 0 && monthly <= 0) return 100;
  const budget = monthlyBudget > 0 ? monthlyBudget : FALLBACK_MONTHLY_BUDGET;
  const upfrontScore = 100 / (1 + Math.max(upfront, 0) / budget / 3);
  const recurringShare = Math.min(Math.max(monthly, 0) / budget, 1);
  return clamp(upfrontScore * (1 - recurringShare));
}

/** Blends value and affordability into a single "is this worth it" number; value counts a bit more. */
export function utility(value: number, upfront: number, monthly: number, budget: number) {
  return value * 10 * 0.6 + affordability(upfront, monthly, budget) * 0.4;
}

export function computeFinancials(d: Decision, settings: Settings): Financials {
  const { profile } = settings;
  const total = totalCost(d.upfrontCost, d.monthlyCost, d.horizonYears);
  const invested = futureValue(
    d.upfrontCost,
    d.monthlyCost,
    d.horizonYears,
    profile.investmentReturn,
  );
  const workHours = profile.hourlyIncome > 0 ? total / profile.hourlyIncome : 0;
  return {
    totalCost: total,
    costPerYear: d.horizonYears > 0 ? total / d.horizonYears : total,
    investedValue: invested,
    foregoneGrowth: invested - total,
    workHours,
    totalHours: Math.max(workHours, 0) + Math.max(d.timeCostHours, 0),
    monthsOfSavings: profile.monthlySavings > 0 ? d.upfrontCost / profile.monthlySavings : null,
  };
}

const WORD_RE = /[a-z0-9]+/g;
const STOP_WORDS = new Set([
  "should", "i", "a", "an", "the", "this", "that", "to", "in", "on", "for", "of",
  "my", "buy", "get", "take", "do", "go", "new", "it", "or", "and", "be", "is",
]);

function keywords(text: string) {
  return new Set(
    (text.toLowerCase().match(WORD_RE) ?? []).filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function findSimilar(d: Decision, history: Decision[], limit = 3): SimilarDecision[] {
  const mine = keywords(d.title);
  return history
    .filter((h) => h.id !== d.id)
    .map((h) => {
      const shared = [...keywords(h.title)].filter((w) => mine.has(w));
      const sameCategory = h.category === d.category;
      const rank = shared.length * 2 + (sameCategory ? 1 : 0) + (h.review ? 0.5 : 0);
      const reason = shared.length
        ? `mentions “${shared.slice(0, 2).join("”, “")}”`
        : "same category";
      return { decision: h, reason, rank, relevant: shared.length > 0 || sameCategory };
    })
    .filter((x) => x.relevant)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ decision, reason }) => ({ decision, reason }));
}

const acted = (d: Decision) => d.choice === "yes" || d.choice === "alternative";
const outcomeScore = (outcome: number) => ((outcome - 1) / 4) * 100;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function recommend(score: number, d: Decision, dominated?: Alternative): Recommendation {
  if (dominated) {
    return {
      label: `Consider “${dominated.name}”`,
      tone: "warn",
      blurb: "An alternative you listed delivers similar value for noticeably less.",
    };
  }
  if (score >= 72)
    return { label: "Strong yes", tone: "good", blurb: "The analysis clearly supports this." };
  if (score >= 60)
    return { label: "Lean yes", tone: "good", blurb: "More points in favour than against." };
  if (score >= 45)
    return {
      label: "Toss-up",
      tone: "info",
      blurb:
        d.reversibility >= 4
          ? "Close call, but it's easy to undo — trying it is a cheap experiment."
          : "Close call and hard to undo — sleep on it or gather more information.",
    };
  if (score >= 32)
    return { label: "Lean no", tone: "warn", blurb: "The downsides outweigh the upside for now." };
  return { label: "Strong no", tone: "bad", blurb: "This doesn't fit your money or your priorities." };
}

export function evaluate(d: Decision, settings: Settings, history: Decision[]): Evaluation {
  const { profile, priorities } = settings;
  const fmt = (n: number) => formatMoney(n, profile.currency);
  const budget = profile.monthlySavings;
  const insights: Insight[] = [];
  const fin = computeFinancials(d, settings);

  // --- Cost -----------------------------------------------------------------
  const costScore = affordability(d.upfrontCost, d.monthlyCost, budget);
  let costSummary: string;
  if (fin.totalCost <= 0) {
    costSummary =
      fin.totalCost < 0
        ? `Net gain of ${fmt(-fin.totalCost)} over ${d.horizonYears} yr.`
        : "No money involved.";
  } else {
    costSummary = `${fmt(fin.totalCost)} total over ${d.horizonYears} yr (${fmt(fin.costPerYear)}/yr).`;
    if (fin.monthsOfSavings !== null && fin.monthsOfSavings >= 1) {
      costSummary += ` Upfront = ${fin.monthsOfSavings.toFixed(1)} months of savings.`;
    }
  }
  if (budget <= 0 && fin.totalCost > 0) {
    insights.push({
      tone: "info",
      text: "Set your monthly savings in Settings so cost can be judged against what you can actually afford.",
    });
  }
  if (budget > 0 && d.monthlyCost > budget * 0.5) {
    insights.push({
      tone: "bad",
      text: `The recurring ${fmt(d.monthlyCost)}/month eats more than half of your monthly savings.`,
    });
  }
  if (fin.monthsOfSavings !== null && fin.monthsOfSavings > 6) {
    insights.push({
      tone: "warn",
      text: `The upfront cost equals ${fin.monthsOfSavings.toFixed(0)} months of savings — make sure your emergency fund stays intact.`,
    });
  }

  // --- Long-term value --------------------------------------------------------
  const valueScore = clamp(d.longTermValue * 10);
  const valueSummary =
    d.longTermValue >= 8
      ? "You expect this to matter for a long time."
      : d.longTermValue >= 5
        ? "Moderate lasting value."
        : "Little lasting value expected — mostly a short-term want.";

  // --- Alternatives -------------------------------------------------------------
  const mainUtility = utility(d.longTermValue, d.upfrontCost, d.monthlyCost, budget);
  let altScore: number | null = null;
  let altSummary = "No alternatives listed.";
  let best: Evaluation["bestAlternative"];
  let dominated: Alternative | undefined;
  if (d.alternatives.length === 0) {
    insights.push({
      tone: "info",
      text: "List at least one alternative — even “do nothing” or “wait 3 months” — to see if this is really the best use of the resources.",
    });
  } else {
    for (const alt of d.alternatives) {
      const u = utility(alt.value, alt.upfrontCost, alt.monthlyCost, budget);
      if (!best || u > best.utility) best = { alternative: alt, utility: u };
      const altTotal = totalCost(alt.upfrontCost, alt.monthlyCost, d.horizonYears);
      if (
        fin.totalCost > 0 &&
        alt.value >= d.longTermValue - 1 &&
        altTotal <= fin.totalCost * 0.6 &&
        (!dominated || alt.value > dominated.value)
      ) {
        dominated = alt;
      }
    }
    const gap = mainUtility - best!.utility;
    altScore = clamp(50 + gap * 2);
    altSummary =
      gap >= 0
        ? `Beats every alternative you listed (best runner-up: ${best!.alternative.name}).`
        : `“${best!.alternative.name}” looks like better value overall.`;
    if (dominated) {
      const altTotal = totalCost(dominated.upfrontCost, dominated.monthlyCost, d.horizonYears);
      insights.push({
        tone: "warn",
        text: `“${dominated.name}” gives nearly the same value (${dominated.value}/10 vs ${d.longTermValue}/10) for ${fmt(fin.totalCost - altTotal)} less.`,
      });
    }
  }

  // --- Opportunity cost --------------------------------------------------------
  const opportunityScore = clamp(100 / (1 + fin.totalHours / WORK_MONTH_HOURS));
  const oppParts: string[] = [];
  if (fin.workHours > 0) oppParts.push(`${round(fin.workHours)} h of work to pay for it`);
  if (d.timeCostHours > 0) oppParts.push(`${round(d.timeCostHours)} h of your time`);
  if (fin.foregoneGrowth > 0 && fin.totalCost > 0) {
    oppParts.push(`${fmt(fin.investedValue)} if invested instead`);
  }
  const opportunitySummary = oppParts.length ? capitalize(oppParts.join(" · ")) + "." : "Practically free.";
  if (fin.workHours > WORK_MONTH_HOURS) {
    insights.push({
      tone: "warn",
      text: `You'd work about ${(fin.workHours / WORK_MONTH_HOURS).toFixed(1)} months to pay for this. Would you trade those months for it?`,
    });
  }
  if (fin.foregoneGrowth > 0 && fin.totalCost > 0 && profile.investmentReturn > 0) {
    insights.push({
      tone: "info",
      text: `Invested at ${profile.investmentReturn}%/yr, the same money would be ${fmt(fin.investedValue)} after ${d.horizonYears} yr (+${fmt(fin.foregoneGrowth)}).`,
    });
  }

  // --- Priorities -------------------------------------------------------------
  let priorityScore: number | null = null;
  let prioritySummary = "Not rated against your priorities yet.";
  const rated = priorities.filter((p) => (d.priorityImpacts[p.id] ?? 0) !== 0);
  if (rated.length > 0) {
    const weighted = rated.reduce((s, p) => s + p.weight * d.priorityImpacts[p.id], 0);
    const maxWeighted = rated.reduce((s, p) => s + p.weight * 2, 0);
    // Coverage: touching more of what you care about makes the signal stronger.
    const coverage = rated.reduce((s, p) => s + p.weight, 0) / priorities.reduce((s, p) => s + p.weight, 0);
    priorityScore = clamp(50 + 50 * (weighted / maxWeighted) * (0.6 + 0.4 * coverage));
    const helps = rated.filter((p) => d.priorityImpacts[p.id] > 0);
    const hurts = rated.filter((p) => d.priorityImpacts[p.id] < 0);
    prioritySummary = [
      helps.length ? `Helps: ${helps.map((p) => p.name).join(", ")}` : "",
      hurts.length ? `Hurts: ${hurts.map((p) => p.name).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const top = [...priorities].sort((a, b) => b.weight - a.weight)[0];
    if (top && (d.priorityImpacts[top.id] ?? 0) <= -2) {
      insights.push({
        tone: "bad",
        text: `This strongly works against your top priority, “${top.name}”.`,
      });
    }
    if (helps.length && hurts.length) {
      insights.push({
        tone: "info",
        text: `Trade-off: you gain on ${helps.map((p) => p.name).join(", ")} but give up on ${hurts.map((p) => p.name).join(", ")}.`,
      });
    }
  } else if (priorities.length > 0) {
    insights.push({ tone: "info", text: "Rate how this affects your priorities — it's the most personal part of the analysis." });
  }

  // --- Pros / cons --------------------------------------------------------------
  let prosConsScore: number | null = null;
  let prosConsSummary = "No pros or cons listed.";
  const pros = d.pros.reduce((s, a) => s + a.weight, 0);
  const cons = d.cons.reduce((s, a) => s + a.weight, 0);
  if (d.pros.length + d.cons.length > 0) {
    prosConsScore = clamp((100 * (pros + 1)) / (pros + cons + 2));
    prosConsSummary = `${d.pros.length} pro${d.pros.length === 1 ? "" : "s"} (weight ${pros}) vs ${d.cons.length} con${d.cons.length === 1 ? "" : "s"} (weight ${cons}).`;
    const majorCons = d.cons.filter((c) => c.weight === 3);
    if (majorCons.length) {
      insights.push({
        tone: "warn",
        text: `Major con${majorCons.length > 1 ? "s" : ""} to resolve first: ${majorCons.map((c) => `“${c.text}”`).join(", ")}.`,
      });
    }
  }

  // --- History ------------------------------------------------------------------
  let historyScore: number | null = null;
  let historySummary = "Not enough reviewed decisions in this category yet.";
  const reviewedPeers = history.filter(
    (h) => h.id !== d.id && h.category === d.category && h.review && acted(h),
  );
  if (reviewedPeers.length >= 2) {
    const outcomes = reviewedPeers.map((h) => h.review!.outcome);
    historyScore = clamp(outcomeScore(avg(outcomes)));
    const same = reviewedPeers.filter((h) => h.review!.wouldDecideSame).length;
    historySummary = `Past ${d.category} decisions you went ahead with averaged ${avg(outcomes).toFixed(1)}/5; you'd repeat ${same} of ${reviewedPeers.length}.`;
    // Optimism bias: expected value vs how things actually turned out.
    const bias = avg(reviewedPeers.map((h) => h.longTermValue / 10 - (h.review!.outcome - 1) / 4));
    if (bias > 0.2) {
      insights.push({
        tone: "warn",
        text: `Heads-up: for ${d.category} decisions you've tended to overestimate the value by about ${round(bias * 10)} points out of 10.`,
      });
    } else if (bias < -0.2) {
      insights.push({
        tone: "good",
        text: `For ${d.category} decisions you've tended to be conservative — they turned out better than you expected.`,
      });
    }
  }
  const similar = findSimilar(d, history);
  for (const s of similar) {
    if (s.decision.review?.lessons) {
      insights.push({
        tone: "info",
        text: `Lesson from “${s.decision.title}”: ${s.decision.review.lessons}`,
      });
      break;
    }
  }

  // --- Combine --------------------------------------------------------------------
  const dimensions: Dimension[] = [
    { key: "cost", label: "Cost", score: costScore, weight: DIMENSION_WEIGHTS.cost, summary: costSummary },
    { key: "value", label: "Long-term value", score: valueScore, weight: DIMENSION_WEIGHTS.value, summary: valueSummary },
    { key: "alternatives", label: "Alternatives", score: altScore, weight: DIMENSION_WEIGHTS.alternatives, summary: altSummary },
    { key: "opportunity", label: "Opportunity cost", score: opportunityScore, weight: DIMENSION_WEIGHTS.opportunity, summary: opportunitySummary },
    { key: "priorities", label: "Your priorities", score: priorityScore, weight: DIMENSION_WEIGHTS.priorities, summary: prioritySummary },
    { key: "prosCons", label: "Pros & cons", score: prosConsScore, weight: DIMENSION_WEIGHTS.prosCons, summary: prosConsSummary },
    { key: "history", label: "Your track record", score: historyScore, weight: DIMENSION_WEIGHTS.history, summary: historySummary },
  ];
  const scored = dimensions.filter((x) => x.score !== null);
  const base =
    scored.reduce((s, x) => s + x.score! * x.weight, 0) / scored.reduce((s, x) => s + x.weight, 0);
  // Easy-to-undo decisions have a capped downside, so they get a small nudge (and vice versa).
  const score = round(clamp(base + (d.reversibility - 3) * 3));
  if (d.reversibility <= 2) {
    insights.push({
      tone: "info",
      text: "This is hard to reverse. Ask: what would have to be true for this to be a mistake?",
    });
  }

  const gap = d.gutFeeling - score;
  if (Math.abs(gap) >= 25) {
    insights.push({
      tone: "warn",
      text:
        gap > 0
          ? `Your gut (${d.gutFeeling}) is much keener than the analysis (${score}). Is there a benefit you haven't written down — or is it just excitement talking?`
          : `The analysis (${score}) is keener than your gut (${d.gutFeeling}). What's the hesitation you haven't put into words?`,
    });
  }

  const completeness = round(
    (100 *
      [
        d.upfrontCost !== 0 || d.monthlyCost !== 0 || d.timeCostHours !== 0,
        d.alternatives.length > 0,
        rated.length > 0,
        d.pros.length > 0,
        d.cons.length > 0,
        d.context.trim().length > 0,
        reviewedPeers.length >= 2,
      ].filter(Boolean).length) /
      7,
  );

  return {
    score,
    recommendation: recommend(score, d, dominated),
    dimensions,
    insights,
    financials: fin,
    bestAlternative: best,
    similar,
    completeness,
  };
}

export function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
