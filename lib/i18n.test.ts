import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, blankDecision, exampleDecisions } from "./defaults";
import { evaluate, findSimilar, formatMoney } from "./engine";
import { LOCALES, currencyOptions, currencySymbol, getDict, priorityName } from "./i18n";
import type { Decision, Settings } from "./types";

/** Shape of a dictionary: keys, array lengths and function arities, but not the text itself. */
function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (Array.isArray(value)) return `array/${value.length}`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  }
  return typeof value;
}

const hindi: Settings = { ...DEFAULT_SETTINGS, locale: "hi", profile: { ...DEFAULT_SETTINGS.profile, currency: "INR" } };

describe("dictionaries", () => {
  it.each(LOCALES.filter((l) => l !== "en"))("%s has the same shape as English", (locale) => {
    expect(shape(getDict(locale))).toEqual(shape(getDict("en")));
  });

  it("names each language in itself", () => {
    expect(LOCALES.map((l) => getDict(l).languageName)).toEqual([
      "English",
      "हिन्दी",
      "Español",
      "Français",
      "Deutsch",
      "Português",
    ]);
  });
});

describe("engine in another language", () => {
  it("writes its verdict, summaries and money in the chosen locale", () => {
    const d: Decision = { ...blankDecision("d"), title: "x", upfrontCost: 123456, longTermValue: 2 };
    const ev = evaluate(d, hindi, []);
    expect(Object.values(getDict("hi").engine.rec)).toContain(ev.recommendation.label);
    expect(ev.dimensions[0].label).toBe("लागत");
    expect(ev.dimensions[0].summary).toContain("₹1,23,456");
  });

  it("builds the examples in the chosen language", () => {
    const examples = exampleDecisions(getDict("es"));
    expect(examples[0].title).toBe("¿Debería comprar este MacBook?");
    const ev = evaluate(examples[0], { ...DEFAULT_SETTINGS, locale: "es" }, examples);
    expect(ev.insights.some((i) => i.text.startsWith("Lección de “¿Debería comprar un reloj inteligente?”"))).toBe(true);
  });

  it("matches similar Hindi titles on real words, not the shared 'should I'", () => {
    const t = getDict("hi");
    const mine: Decision = { ...blankDecision("a"), title: "क्या मुझे नया लैपटॉप ख़रीदना चाहिए?", category: "other" };
    const laptop: Decision = { ...blankDecision("b"), title: "क्या मुझे पुराना लैपटॉप बेचना चाहिए?", category: "finance" };
    const trip: Decision = { ...blankDecision("c"), title: "क्या मुझे गोवा जाना चाहिए?", category: "travel" };
    const similar = findSimilar(mine, [laptop, trip], t);
    expect(similar.map((s) => s.decision.id)).toEqual(["b"]);
    expect(similar[0].reason).toBe("“लैपटॉप” का ज़िक्र");
  });
});

describe("priorityName", () => {
  it("translates built-in names until the user renames them", () => {
    const t = getDict("de");
    expect(priorityName({ id: "p-health", name: "Health" }, t)).toBe("Gesundheit");
    // A default name saved in another language still counts as unchanged.
    expect(priorityName({ id: "p-health", name: "Salud" }, t)).toBe("Gesundheit");
    expect(priorityName({ id: "p-health", name: "Marathon training" }, t)).toBe("Marathon training");
    expect(priorityName({ id: "custom-1", name: "Family nearby" }, t)).toBe("Family nearby");
  });
});

describe("currencies", () => {
  it("offers every ISO currency with a localized name", () => {
    const options = currencyOptions("hi");
    expect(options.length).toBeGreaterThan(100);
    expect(options.find((o) => o.code === "INR")?.label).toBe("INR — भारतीय रुपया");
    expect(currencyOptions("en").find((o) => o.code === "JPY")?.label).toBe("JPY — Japanese Yen");
  });

  it("uses short symbols in inputs and the locale's grouping in amounts", () => {
    expect(currencySymbol("INR", "en")).toBe("₹");
    expect(currencySymbol("EUR", "de")).toBe("€");
    expect(formatMoney(1999, "EUR", "de")).toBe("1.999\u00a0€"); // non-breaking space
    expect(formatMoney(123456, "INR", "hi")).toBe("₹1,23,456");
  });
});
