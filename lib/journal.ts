import type { Category, Decision } from "./types";

export interface CategoryStat {
  category: Category;
  count: number;
  reviewed: number;
  avgOutcome: number | null;
}

export interface JournalStats {
  total: number;
  open: number;
  decided: number;
  reviewed: number;
  dueForReview: Decision[];
  /** Share of reviewed decisions whose reasoning held up ("right" or "unlucky"). */
  soundReasoningRate: number | null;
  wouldDecideSameRate: number | null;
  avgOutcome: number | null;
  /** Pearson correlation between the engine's score and the eventual outcome (acted-on decisions). */
  engineCalibration: number | null;
  /** Same, for your gut feeling. */
  gutCalibration: number | null;
  /** How often following the engine's lean (score >= 50 → yes) matched a good result. */
  engineHitRate: number | null;
  byCategory: CategoryStat[];
  lessons: { decision: Decision; lesson: string }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const mx = avg(xs)!;
  const my = avg(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function isDueForReview(d: Decision, now = new Date()) {
  return d.status === "decided" && !!d.reviewAt && new Date(d.reviewAt) <= now;
}

export function journalStats(decisions: Decision[], now = new Date()): JournalStats {
  const reviewed = decisions.filter((d) => d.review);
  const actedReviewed = reviewed.filter(
    (d) => (d.choice === "yes" || d.choice === "alternative") && d.scoreAtDecision !== undefined,
  );

  // A "yes" with a good outcome, or a "no" you don't regret, counts as a hit.
  const judged = reviewed.filter(
    (d) => d.scoreAtDecision !== undefined && (d.choice === "yes" || d.choice === "no"),
  );
  const hits = judged.filter((d) => {
    const engineSaidYes = d.scoreAtDecision! >= 50;
    const choseYes = d.choice === "yes";
    const goodCall = d.review!.wouldDecideSame;
    return engineSaidYes === choseYes ? goodCall : !goodCall;
  });

  const categories = [...new Set(decisions.map((d) => d.category))];

  return {
    total: decisions.length,
    open: decisions.filter((d) => d.status === "open").length,
    decided: decisions.filter((d) => d.status === "decided").length,
    reviewed: reviewed.length,
    dueForReview: decisions
      .filter((d) => isDueForReview(d, now))
      .sort((a, b) => a.reviewAt!.localeCompare(b.reviewAt!)),
    soundReasoningRate: reviewed.length
      ? reviewed.filter((d) => d.review!.verdict === "right" || d.review!.verdict === "unlucky")
          .length / reviewed.length
      : null,
    wouldDecideSameRate: reviewed.length
      ? reviewed.filter((d) => d.review!.wouldDecideSame).length / reviewed.length
      : null,
    avgOutcome: avg(reviewed.map((d) => d.review!.outcome)),
    engineCalibration: correlation(
      actedReviewed.map((d) => d.scoreAtDecision!),
      actedReviewed.map((d) => d.review!.outcome),
    ),
    gutCalibration: correlation(
      actedReviewed.map((d) => d.gutFeeling),
      actedReviewed.map((d) => d.review!.outcome),
    ),
    engineHitRate: judged.length ? hits.length / judged.length : null,
    byCategory: categories
      .map((category) => {
        const inCat = decisions.filter((d) => d.category === category);
        const rev = inCat.filter((d) => d.review);
        return {
          category,
          count: inCat.length,
          reviewed: rev.length,
          avgOutcome: avg(rev.map((d) => d.review!.outcome)),
        };
      })
      .sort((a, b) => b.count - a.count),
    lessons: reviewed
      .filter((d) => d.review!.lessons.trim())
      .sort((a, b) => b.review!.reviewedAt.localeCompare(a.review!.reviewedAt))
      .map((d) => ({ decision: d, lesson: d.review!.lessons })),
  };
}
