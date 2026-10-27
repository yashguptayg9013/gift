import de from "./de";
import en, { type Dict } from "./en";
import es from "./es";
import fr from "./fr";
import hi from "./hi";
import pt from "./pt";

export type { Dict };

export const LOCALES = ["en", "hi", "es", "fr", "de", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

const DICTS: Record<Locale, Dict> = { en, hi, es, fr, de, pt };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}

/** Best match for the browser's preferred languages, falling back to English. */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}

/**
 * Built-in priorities are stored with their English names. Until the user renames one,
 * show it in the current language (a name matching any language's default counts as unchanged).
 */
export function priorityName(p: { id: string; name: string }, t: Dict): string {
  const translated = t.priorities[p.id];
  if (!translated) return p.name;
  const isDefault = LOCALES.some((l) => DICTS[l].priorities[p.id] === p.name);
  return isDefault ? translated : p.name;
}

const FALLBACK_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "CNY", "BRL", "MXN", "SGD", "AED"];

/** Every ISO currency the browser knows, labelled in the current language and sorted by name. */
export function currencyOptions(locale: Locale): { code: string; label: string }[] {
  let codes: string[] = FALLBACK_CURRENCIES;
  try {
    codes = Intl.supportedValuesOf("currency");
  } catch {
    // Older browsers: keep the short list.
  }
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "currency" });
  } catch {
    names = null;
  }
  return codes
    .map((code) => {
      const name = names?.of(code);
      return { code, label: name && name !== code ? `${code} — ${name}` : code };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** "₹", "$", "CHF"… — the short symbol shown inside money inputs. */
export function currencySymbol(currency: string, locale: Locale): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}
