import type { Locale } from "./i18n";

export type Category = "purchase" | "career" | "travel" | "finance" | "personal" | "other";

/** Labels live in the i18n dictionaries under `categories`. */
export const CATEGORIES: { value: Category; emoji: string }[] = [
  { value: "purchase", emoji: "🛒" },
  { value: "career", emoji: "💼" },
  { value: "travel", emoji: "✈️" },
  { value: "finance", emoji: "💰" },
  { value: "personal", emoji: "🌱" },
  { value: "other", emoji: "🧩" },
];

export interface Priority {
  id: string;
  name: string;
  /** How much this priority matters to you, 1 (a little) to 5 (above all else). */
  weight: number;
}

export interface Profile {
  currency: string;
  /** What you can comfortably save / spend on discretionary things per month. */
  monthlySavings: number;
  /** Your effective take-home pay per hour, used to convert money into time. */
  hourlyIncome: number;
  /** Expected annual return if the money were invested instead (percent). */
  investmentReturn: number;
}

export interface Settings {
  locale: Locale;
  profile: Profile;
  priorities: Priority[];
}

export interface Alternative {
  id: string;
  name: string;
  upfrontCost: number;
  monthlyCost: number;
  /** Long-term value you expect from this alternative, 0-10. */
  value: number;
}

export interface Argument {
  id: string;
  text: string;
  /** 1 = minor, 2 = notable, 3 = major */
  weight: number;
}

export type Choice = "yes" | "no" | "alternative" | "deferred";

export type Verdict = "right" | "lucky" | "unlucky" | "wrong";

export interface Review {
  reviewedAt: string;
  /** How did it actually turn out? 1 (terrible) - 5 (great) */
  outcome: number;
  wouldDecideSame: boolean;
  /** Was your reasoning sound, independent of how it turned out? */
  verdict: Verdict;
  lessons: string;
}

export interface SecondOpinion {
  /** How Claude's view compares with the engine's lean. */
  stance: "agree" | "partly_agree" | "disagree";
  recommendation: string;
  summary: string;
  blindSpots: string[];
  risks: string[];
  questions: string[];
  alternatives: string[];
  confidence: "low" | "medium" | "high";
}

export interface StoredSecondOpinion extends SecondOpinion {
  createdAt: string;
  /** Model that actually answered (may differ from the requested one after a fallback). */
  model: string;
  /** Engine score the opinion was given against. */
  engineScore: number;
}

export interface Decision {
  id: string;
  title: string;
  category: Category;
  context: string;
  createdAt: string;
  updatedAt: string;

  upfrontCost: number;
  monthlyCost: number;
  /** How many years the decision keeps paying off (or costing). */
  horizonYears: number;
  /** Long-term value you expect, 0-10. */
  longTermValue: number;
  /** How easily it can be undone, 1 (permanent) - 5 (trivially reversible). */
  reversibility: number;
  /** Hours of your time it consumes (research, travel days, commute…). */
  timeCostHours: number;

  alternatives: Alternative[];
  /** priorityId -> impact from -2 (strongly hurts) to +2 (strongly helps) */
  priorityImpacts: Record<string, number>;
  pros: Argument[];
  cons: Argument[];
  /** Gut feeling before seeing the score: 0 (definitely not) - 100 (definitely yes). */
  gutFeeling: number;

  status: "open" | "decided" | "reviewed";
  choice?: Choice;
  chosenAlternativeId?: string;
  decidedAt?: string;
  rationale?: string;
  expectedOutcome?: string;
  /** ISO date when you want to look back on this decision. */
  reviewAt?: string;
  /** Engine score captured at the moment of deciding. */
  scoreAtDecision?: number;
  review?: Review;
  secondOpinion?: StoredSecondOpinion;
}
