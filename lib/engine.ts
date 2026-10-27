import { getDict, priorityName, type Dict, type Locale } from "./i18n";
import en from "./i18n/en";
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

// Letters with their combining marks, so Devanagari words aren't split at vowel signs.
const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;
/** Words every decision title shares in the supported languages ("should I buy…"). */
const STOP_WORDS = new Set([
  // en
  "should", "the", "this", "that", "for", "and", "buy", "get", "take", "new",
  // es / pt
  "debería", "debo", "devo", "comprar", "este", "esta", "esto", "para", "con", "com", "una", "uma", "aceptar", "aceitar", "viajar",
  // fr
  "dois", "acheter", "cette", "pour", "avec", "les", "des", "accepter", "partir",
  // de
  "soll", "ich", "kaufen", "diesen", "dieses", "diese", "eine", "einen", "für", "mit", "der", "die", "das", "annehmen",
  // hi
  "क्या", "मुझे", "चाहिए", "यह", "ख़रीदना", "ख़रीदनी", "ख़रीदने", "लेनी", "लेना", "करना", "में", "के", "की", "को", "एक", "वाली",
]);

function keywords(text: string) {
  return new Set(
    (text.toLowerCase().match(WORD_RE) ?? []).filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function findSimilar(d: Decision, history: Decision[], t: Dict = en, limit = 3): SimilarDecision[] {
  const mine = keywords(d.title);
  return history
    .filter((h) => h.id !== d.id)
    .map((h) => {
      const shared = [...keywords(h.title)].filter((w) => mine.has(w));
      const sameCategory = h.category === d.category;
      const rank = shared.length * 2 + (sameCategory ? 1 : 0) + (h.review ? 0.5 : 0);
      const reason = shared.length
        ? t.engine.mentions(shared.slice(0, 2).map((w) => `“${w}”`).join(t.engine.listJoin))
        : t.engine.sameCategory;
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

function recommend(score: number, d: Decision, t: Dict, dominated?: Alternative): Recommendation {
  const r = t.engine.rec;
  if (dominated) return { label: r.consider(dominated.name), tone: "warn", blurb: r.considerBlurb };
  if (score >= 72) return { label: r.strongYes, tone: "good", blurb: r.strongYesBlurb };
  if (score >= 60) return { label: r.leanYes, tone: "good", blurb: r.leanYesBlurb };
  if (score >= 45) {
    return { label: r.tossUp, tone: "info", blurb: d.reversibility >= 4 ? r.tossUpReversible : r.tossUpPermanent };
  }
  if (score >= 32) return { label: r.leanNo, tone: "warn", blurb: r.leanNoBlurb };
  return { label: r.strongNo, tone: "bad", blurb: r.strongNoBlurb };
}

export function evaluate(d: Decision, settings: Settings, history: Decision[]): Evaluation {
  const { profile, priorities, locale } = settings;
  const t = getDict(locale);
  const e = t.engine;
  const fmt = (n: number) => formatMoney(n, profile.currency, locale);
  const num = (n: number, digits: number) => formatNumber(n, locale, digits);
  const names = (ps: { id: string; name: string }[]) => ps.map((p) => priorityName(p, t)).join(e.listJoin);
  const budget = profile.monthlySavings;
  const insights: Insight[] = [];
  const fin = computeFinancials(d, settings);

  // --- Cost -----------------------------------------------------------------
  const costScore = affordability(d.upfrontCost, d.monthlyCost, budget);
  let costSummary: string;
  if (fin.totalCost <= 0) {
    costSummary = fin.totalCost < 0 ? e.netGain(fmt(-fin.totalCost), d.horizonYears) : e.noMoney;
  } else {
    costSummary = e.costTotal(fmt(fin.totalCost), d.horizonYears, fmt(fin.costPerYear));
    if (fin.monthsOfSavings !== null && fin.monthsOfSavings >= 1) {
      costSummary += e.upfrontMonths(num(fin.monthsOfSavings, 1));
    }
  }
  if (budget <= 0 && fin.totalCost > 0) insights.push({ tone: "info", text: e.setSavings });
  if (budget > 0 && d.monthlyCost > budget * 0.5) {
    insights.push({ tone: "bad", text: e.recurringHeavy(fmt(d.monthlyCost)) });
  }
  if (fin.monthsOfSavings !== null && fin.monthsOfSavings > 6) {
    insights.push({ tone: "warn", text: e.upfrontHeavy(num(fin.monthsOfSavings, 0)) });
  }

  // --- Long-term value --------------------------------------------------------
  const valueScore = clamp(d.longTermValue * 10);
  const valueSummary = d.longTermValue >= 8 ? e.valueHigh : d.longTermValue >= 5 ? e.valueMid : e.valueLow;

  // --- Alternatives -------------------------------------------------------------
  const mainUtility = utility(d.longTermValue, d.upfrontCost, d.monthlyCost, budget);
  let altScore: number | null = null;
  let altSummary = e.noAlternatives;
  let best: Evaluation["bestAlternative"];
  let dominated: Alternative | undefined;
  if (d.alternatives.length === 0) {
    insights.push({ tone: "info", text: e.listAlternative });
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
    altSummary = gap >= 0 ? e.beatsAll(best!.alternative.name) : e.altBetter(best!.alternative.name);
    if (dominated) {
      const altTotal = totalCost(dominated.upfrontCost, dominated.monthlyCost, d.horizonYears);
      insights.push({
        tone: "warn",
        text: e.dominated(dominated.name, dominated.value, d.longTermValue, fmt(fin.totalCost - altTotal)),
      });
    }
  }

  // --- Opportunity cost --------------------------------------------------------
  const opportunityScore = clamp(100 / (1 + fin.totalHours / WORK_MONTH_HOURS));
  const oppParts: string[] = [];
  if (fin.workHours > 0) oppParts.push(e.workHours(round(fin.workHours)));
  if (d.timeCostHours > 0) oppParts.push(e.timeHours(round(d.timeCostHours)));
  if (fin.foregoneGrowth > 0 && fin.totalCost > 0) oppParts.push(e.ifInvestedInstead(fmt(fin.investedValue)));
  const opportunitySummary = oppParts.length ? capitalize(oppParts.join(" · ")) + "." : e.practicallyFree;
  if (fin.workHours > WORK_MONTH_HOURS) {
    insights.push({ tone: "warn", text: e.workMonths(num(fin.workHours / WORK_MONTH_HOURS, 1)) });
  }
  if (fin.foregoneGrowth > 0 && fin.totalCost > 0 && profile.investmentReturn > 0) {
    insights.push({
      tone: "info",
      text: e.investedInsight(profile.investmentReturn, fmt(fin.investedValue), d.horizonYears, fmt(fin.foregoneGrowth)),
    });
  }

  // --- Priorities -------------------------------------------------------------
  let priorityScore: number | null = null;
  let prioritySummary = e.notRated;
  const rated = priorities.filter((p) => (d.priorityImpacts[p.id] ?? 0) !== 0);
  if (rated.length > 0) {
    const weighted = rated.reduce((s, p) => s + p.weight * d.priorityImpacts[p.id], 0);
    const maxWeighted = rated.reduce((s, p) => s + p.weight * 2, 0);
    // Coverage: touching more of what you care about makes the signal stronger.
    const coverage = rated.reduce((s, p) => s + p.weight, 0) / priorities.reduce((s, p) => s + p.weight, 0);
    priorityScore = clamp(50 + 50 * (weighted / maxWeighted) * (0.6 + 0.4 * coverage));
    const helps = rated.filter((p) => d.priorityImpacts[p.id] > 0);
    const hurts = rated.filter((p) => d.priorityImpacts[p.id] < 0);
    prioritySummary = [helps.length ? e.helps(names(helps)) : "", hurts.length ? e.hurts(names(hurts)) : ""]
      .filter(Boolean)
      .join(" · ");
    const top = [...priorities].sort((a, b) => b.weight - a.weight)[0];
    if (top && (d.priorityImpacts[top.id] ?? 0) <= -2) {
      insights.push({ tone: "bad", text: e.topPriority(priorityName(top, t)) });
    }
    if (helps.length && hurts.length) {
      insights.push({ tone: "info", text: e.tradeOff(names(helps), names(hurts)) });
    }
  } else if (priorities.length > 0) {
    insights.push({ tone: "info", text: e.ratePriorities });
  }

  // --- Pros / cons --------------------------------------------------------------
  let prosConsScore: number | null = null;
  let prosConsSummary = e.noProsCons;
  const pros = d.pros.reduce((s, a) => s + a.weight, 0);
  const cons = d.cons.reduce((s, a) => s + a.weight, 0);
  if (d.pros.length + d.cons.length > 0) {
    prosConsScore = clamp((100 * (pros + 1)) / (pros + cons + 2));
    prosConsSummary = e.prosConsSummary(d.pros.length, pros, d.cons.length, cons);
    const majorCons = d.cons.filter((c) => c.weight === 3);
    if (majorCons.length) {
      insights.push({ tone: "warn", text: e.majorCons(majorCons.map((c) => `“${c.text}”`).join(e.listJoin)) });
    }
  }

  // --- History ------------------------------------------------------------------
  let historyScore: number | null = null;
  let historySummary = e.noHistory;
  // Lower-case mid-sentence, except in German where nouns stay capitalised.
  const categoryName = locale === "de" ? t.categories[d.category] : t.categories[d.category].toLowerCase();
  const reviewedPeers = history.filter(
    (h) => h.id !== d.id && h.category === d.category && h.review && acted(h),
  );
  if (reviewedPeers.length >= 2) {
    const outcomes = reviewedPeers.map((h) => h.review!.outcome);
    historyScore = clamp(outcomeScore(avg(outcomes)));
    const same = reviewedPeers.filter((h) => h.review!.wouldDecideSame).length;
    historySummary = e.historySummary(categoryName, num(avg(outcomes), 1), same, reviewedPeers.length);
    // Optimism bias: expected value vs how things actually turned out.
    const bias = avg(reviewedPeers.map((h) => h.longTermValue / 10 - (h.review!.outcome - 1) / 4));
    if (bias > 0.2) {
      insights.push({ tone: "warn", text: e.overestimate(categoryName, round(bias * 10)) });
    } else if (bias < -0.2) {
      insights.push({ tone: "good", text: e.conservative(categoryName) });
    }
  }
  const similar = findSimilar(d, history, t);
  for (const s of similar) {
    if (s.decision.review?.lessons) {
      insights.push({ tone: "info", text: e.lessonFrom(s.decision.title, s.decision.review.lessons) });
      break;
    }
  }

  // --- Combine --------------------------------------------------------------------
  const dim = (key: DimensionKey, score: number | null, summary: string): Dimension => ({
    key,
    label: e.dims[key],
    score,
    weight: DIMENSION_WEIGHTS[key],
    summary,
  });
  const dimensions: Dimension[] = [
    dim("cost", costScore, costSummary),
    dim("value", valueScore, valueSummary),
    dim("alternatives", altScore, altSummary),
    dim("opportunity", opportunityScore, opportunitySummary),
    dim("priorities", priorityScore, prioritySummary),
    dim("prosCons", prosConsScore, prosConsSummary),
    dim("history", historyScore, historySummary),
  ];
  const scored = dimensions.filter((x) => x.score !== null);
  const base =
    scored.reduce((s, x) => s + x.score! * x.weight, 0) / scored.reduce((s, x) => s + x.weight, 0);
  // Easy-to-undo decisions have a capped downside, so they get a small nudge (and vice versa).
  const score = round(clamp(base + (d.reversibility - 3) * 3));
  if (d.reversibility <= 2) insights.push({ tone: "info", text: e.hardToReverse });

  const gap = d.gutFeeling - score;
  if (Math.abs(gap) >= 25) {
    insights.push({
      tone: "warn",
      text: gap > 0 ? e.gutKeener(d.gutFeeling, score) : e.analysisKeener(score, d.gutFeeling),
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
    recommendation: recommend(score, d, t, dominated),
    dimensions,
    insights,
    financials: fin,
    bestAlternative: best,
    similar,
    completeness,
  };
}

export function formatMoney(n: number, currency: string, locale: Locale = "en") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

export function formatNumber(n: number, locale: Locale = "en", digits = 0) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
