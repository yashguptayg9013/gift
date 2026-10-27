import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, blankDecision, exampleDecisions } from "./defaults";
import { affordability, evaluate, findSimilar, futureValue, totalCost } from "./engine";
import { MAX_BRIEF_CHARS, buildBrief } from "./brief";
import { correlation, journalStats } from "./journal";
import type { Decision } from "./types";

const decision = (over: Partial<Decision> = {}): Decision => ({
  ...blankDecision("d1"),
  title: "Should I buy this MacBook?",
  ...over,
});

describe("money helpers", () => {
  it("totals upfront and recurring cost over the horizon", () => {
    expect(totalCost(1000, 50, 2)).toBe(2200);
  });

  it("compounds monthly when computing future value", () => {
    expect(futureValue(1000, 0, 1, 0)).toBe(1000);
    expect(futureValue(1000, 0, 1, 12)).toBeCloseTo(1126.83, 1);
    expect(futureValue(0, 100, 1, 0)).toBe(1200);
  });

  it("scores affordability against the monthly budget", () => {
    expect(affordability(0, 0, 1000)).toBe(100);
    expect(affordability(3000, 0, 1000)).toBeCloseTo(50);
    expect(affordability(0, 1000, 1000)).toBe(0);
    // Net gains (e.g. a raise) are never penalised.
    expect(affordability(0, -500, 1000)).toBe(100);
  });
});

describe("evaluate", () => {
  it("scores a cheap, valuable, priority-aligned decision highly", () => {
    const ev = evaluate(
      decision({
        upfrontCost: 50,
        longTermValue: 9,
        reversibility: 4,
        priorityImpacts: { "p-health": 2, "p-experiences": 2 },
        pros: [{ id: "p", text: "Great", weight: 3 }],
      }),
      DEFAULT_SETTINGS,
      [],
    );
    expect(ev.score).toBeGreaterThanOrEqual(72);
    expect(ev.recommendation.label).toBe("Strong yes");
  });

  it("scores an expensive, low-value decision that hurts priorities poorly", () => {
    const ev = evaluate(
      decision({
        upfrontCost: 20000,
        monthlyCost: 300,
        longTermValue: 2,
        reversibility: 1,
        priorityImpacts: { "p-finance": -2 },
        cons: [{ id: "c", text: "Debt", weight: 3 }],
      }),
      DEFAULT_SETTINGS,
      [],
    );
    expect(ev.score).toBeLessThan(32);
    expect(ev.insights.some((i) => i.text.includes("top priority"))).toBe(true);
  });

  it("flags a cheaper alternative with similar value", () => {
    const ev = evaluate(
      decision({
        upfrontCost: 2000,
        longTermValue: 7,
        alternatives: [{ id: "a", name: "Air", upfrontCost: 1000, monthlyCost: 0, value: 7 }],
      }),
      DEFAULT_SETTINGS,
      [],
    );
    expect(ev.recommendation.label).toContain("Air");
    expect(ev.dimensions.find((d) => d.key === "alternatives")!.score).toBeLessThan(50);
  });

  it("leaves dimensions without input unscored", () => {
    const ev = evaluate(decision(), DEFAULT_SETTINGS, []);
    const unscored = ev.dimensions.filter((d) => d.score === null).map((d) => d.key);
    expect(unscored).toEqual(["alternatives", "priorities", "prosCons", "history"]);
  });

  it("uses reviewed decisions in the same category as track record", () => {
    const history = exampleDecisions();
    const ev = evaluate(decision({ id: "new" }), DEFAULT_SETTINGS, history);
    const record = ev.dimensions.find((d) => d.key === "history")!;
    // Examples hold two reviewed purchases: outcomes 2 and 4 → avg 3/5 → 50.
    expect(record.score).toBe(50);
    expect(ev.similar[0].decision.category).toBe("purchase");
  });

  it("calls out a gap between gut feeling and analysis", () => {
    const ev = evaluate(
      decision({ upfrontCost: 20000, longTermValue: 2, gutFeeling: 95 }),
      DEFAULT_SETTINGS,
      [],
    );
    expect(ev.insights.some((i) => i.text.startsWith("Your gut"))).toBe(true);
  });
});

describe("findSimilar", () => {
  it("prefers shared keywords over category matches", () => {
    const history = [
      decision({ id: "a", title: "Should I buy a bike?", category: "purchase" }),
      decision({ id: "b", title: "Upgrade my old macbook", category: "other" }),
    ];
    const similar = findSimilar(decision({ id: "x" }), history);
    expect(similar.map((s) => s.decision.id)).toEqual(["b", "a"]);
  });
});

describe("journalStats", () => {
  it("summarises the example journal", () => {
    const stats = journalStats(exampleDecisions());
    expect(stats.total).toBe(6);
    expect(stats.reviewed).toBe(3);
    expect(stats.dueForReview.map((d) => d.id)).toEqual(["ex-course"]);
    expect(stats.wouldDecideSameRate).toBeCloseTo(2 / 3);
    expect(stats.engineCalibration).toBeGreaterThan(0.9);
  });

  it("needs at least three points for a correlation", () => {
    expect(correlation([1, 2], [1, 2])).toBeNull();
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
});

describe("buildBrief", () => {
  it("includes the inputs, the engine's verdict and lessons from similar decisions", () => {
    const history = exampleDecisions();
    const d = history.find((h) => h.id === "ex-macbook")!;
    const ev = evaluate(d, DEFAULT_SETTINGS, history);
    const brief = buildBrief(d, DEFAULT_SETTINGS, ev);
    expect(brief).toContain("# Decision: Should I buy this MacBook?");
    expect(brief).toContain("MacBook Air: upfront $1,299");
    expect(brief).toContain("Career growth (importance 3): strongly helps");
    expect(brief).toContain(`Overall score: ${ev.score}/100`);
    expect(brief).toContain("lesson: Gadgets don't create habits");
    // Open decisions in the journal are not shared.
    expect(brief).not.toContain("Japan");
    expect(brief.length).toBeLessThan(MAX_BRIEF_CHARS);
  });
});
