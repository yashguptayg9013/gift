"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { evaluate } from "@/lib/engine";
import { currencySymbol, priorityName } from "@/lib/i18n";
import { saveDecision, uid, useAppState, useT } from "@/lib/store";
import { CATEGORIES, type Alternative, type Argument, type Decision } from "@/lib/types";
import {
  Button,
  Card,
  CardTitle,
  Field,
  NumberInput,
  ScorePill,
  Slider,
  TextArea,
  TextInput,
  inputClass,
} from "./ui";

const IMPACTS = [
  { value: -2, label: "−−" },
  { value: -1, label: "−" },
  { value: 0, label: "0" },
  { value: 1, label: "+" },
  { value: 2, label: "++" },
];

export default function DecisionForm({ initial }: { initial: Decision }) {
  const router = useRouter();
  const { settings, decisions } = useAppState();
  const [d, setD] = useState<Decision>(initial);
  const [titleMissing, setTitleMissing] = useState(false);
  const t = useT();
  const currency = currencySymbol(settings.profile.currency, settings.locale);

  const set = <K extends keyof Decision>(key: K, value: Decision[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const preview = useMemo(() => evaluate(d, settings, decisions), [d, settings, decisions]);

  const save = () => {
    if (!d.title.trim()) {
      setTitleMissing(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    saveDecision({ ...d, title: d.title.trim() });
    router.push(`/decisions/${d.id}`);
  };

  return (
    <div className="space-y-5 pb-28">
      <Card>
        <CardTitle hint={t.form.whatHint}>{t.form.whatTitle}</CardTitle>
        <div className="space-y-4">
          <div>
            <TextInput
              autoFocus={!initial.title}
              placeholder={t.form.examples[0]}
              value={d.title}
              onChange={(e) => {
                set("title", e.target.value);
                setTitleMissing(false);
              }}
              className="text-base"
            />
            {titleMissing && <p className="mt-1.5 text-sm text-bad">{t.form.titleRequired}</p>}
            {!d.title && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.form.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => set("title", ex)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Field label={t.form.category}>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set("category", c.value)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    d.category === c.value
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {c.emoji} {t.categories[c.value]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t.form.context} hint={t.form.contextHint}>
            <TextArea value={d.context} onChange={(e) => set("context", e.target.value)} />
          </Field>
          <Field label={t.form.gut} hint={t.form.gutHint}>
            <Slider
              min={0}
              max={100}
              step={5}
              value={d.gutFeeling}
              onChange={(n) => set("gutFeeling", n)}
              left={t.form.gutLeft}
              right={t.form.gutRight}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle hint={t.form.costHint}>{t.form.costTitle}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.form.upfront}>
            <NumberInput prefix={currency} value={d.upfrontCost} onChange={(n) => set("upfrontCost", n)} />
          </Field>
          <Field label={t.form.monthly} hint={t.form.monthlyHint}>
            <NumberInput prefix={currency} value={d.monthlyCost} onChange={(n) => set("monthlyCost", n)} />
          </Field>
          <Field label={t.form.horizon} hint={t.form.horizonHint}>
            <NumberInput min={0} step={0.5} value={d.horizonYears} onChange={(n) => set("horizonYears", Math.max(0, n))} />
          </Field>
          <Field label={t.form.timeCost} hint={t.form.timeCostHint}>
            <NumberInput min={0} value={d.timeCostHours} onChange={(n) => set("timeCostHours", Math.max(0, n))} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>{t.form.valueTitle}</CardTitle>
        <div className="space-y-4">
          <Field label={t.form.valueQuestion}>
            <Slider
              min={0}
              max={10}
              value={d.longTermValue}
              onChange={(n) => set("longTermValue", n)}
              left={t.form.valueLeft}
              right={t.form.valueRight}
              display={`${d.longTermValue}/10`}
            />
          </Field>
          <Field label={t.form.reversibleQuestion}>
            <Slider
              min={1}
              max={5}
              value={d.reversibility}
              onChange={(n) => set("reversibility", n)}
              display={`${d.reversibility}/5`}
            />
            <p className="mt-1 text-xs text-muted">{t.form.reversibility[d.reversibility]}</p>
          </Field>
        </div>
      </Card>

      <AlternativesEditor
        alternatives={d.alternatives}
        currency={currency}
        onChange={(alts) => set("alternatives", alts)}
      />

      <Card>
        <CardTitle hint={t.form.prioritiesHint}>{t.form.prioritiesTitle}</CardTitle>
        {settings.priorities.length === 0 ? (
          <p className="text-sm text-muted">{t.form.noPriorities}</p>
        ) : (
          <ul className="space-y-2.5">
            {settings.priorities.map((p) => {
              const current = d.priorityImpacts[p.id] ?? 0;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    {priorityName(p, t)}
                    <span className="ml-1.5 text-xs text-muted">{"★".repeat(p.weight)}</span>
                  </span>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    {IMPACTS.map((imp) => (
                      <button
                        key={imp.value}
                        type="button"
                        title={t.form.impacts[imp.value + 2]}
                        aria-label={`${priorityName(p, t)}: ${t.form.impacts[imp.value + 2]}`}
                        aria-pressed={current === imp.value}
                        onClick={() => set("priorityImpacts", { ...d.priorityImpacts, [p.id]: imp.value })}
                        className={`w-10 py-1 text-sm font-mono ${
                          current === imp.value
                            ? imp.value > 0
                              ? "bg-good-soft text-good font-semibold"
                              : imp.value < 0
                                ? "bg-bad-soft text-bad font-semibold"
                                : "bg-background font-semibold"
                            : "text-muted hover:bg-background"
                        }`}
                      >
                        {imp.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <ArgumentsEditor title={t.form.pros} items={d.pros} onChange={(xs) => set("pros", xs)} placeholder={t.form.proPlaceholder} />
        <ArgumentsEditor title={t.form.cons} items={d.cons} onChange={(xs) => set("cons", xs)} placeholder={t.form.conPlaceholder} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <ScorePill score={preview.score} />
          <div className="mr-auto min-w-0">
            <div className="truncate text-sm font-medium">{preview.recommendation.label}</div>
            <div className="text-xs text-muted">{t.form.livePreview(preview.completeness)}</div>
          </div>
          <Button variant="ghost" onClick={() => router.back()}>
            {t.common.cancel}
          </Button>
          <Button onClick={save}>{t.form.saveEvaluate}</Button>
        </div>
      </div>
    </div>
  );
}

function AlternativesEditor({
  alternatives,
  currency,
  onChange,
}: {
  alternatives: Alternative[];
  currency: string;
  onChange: (alts: Alternative[]) => void;
}) {
  const t = useT();
  const update = (id: string, patch: Partial<Alternative>) =>
    onChange(alternatives.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = (name = "") =>
    onChange([...alternatives, { id: uid(), name, upfrontCost: 0, monthlyCost: 0, value: 5 }]);

  return (
    <Card>
      <CardTitle hint={t.form.alternativesHint}>{t.form.alternativesTitle}</CardTitle>
      <div className="space-y-3">
        {alternatives.map((a) => (
          <div key={a.id} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_7rem_7rem_9rem_auto] sm:items-end">
            <Field label={t.form.option} className="col-span-2 sm:col-span-1">
              <TextInput value={a.name} placeholder={t.form.optionPlaceholder} onChange={(e) => update(a.id, { name: e.target.value })} />
            </Field>
            <Field label={t.form.altUpfront}>
              <NumberInput prefix={currency} value={a.upfrontCost} onChange={(n) => update(a.id, { upfrontCost: n })} />
            </Field>
            <Field label={t.form.altMonthly}>
              <NumberInput prefix={currency} value={a.monthlyCost} onChange={(n) => update(a.id, { monthlyCost: n })} />
            </Field>
            <Field label={t.form.altValue(a.value)} className="col-span-2 sm:col-span-1">
              <input
                type="range"
                min={0}
                max={10}
                value={a.value}
                onChange={(e) => update(a.id, { value: Number(e.target.value) })}
                className="w-full py-2"
              />
            </Field>
            <Button
              variant="danger"
              className="col-span-2 sm:col-span-1"
              onClick={() => onChange(alternatives.filter((x) => x.id !== a.id))}
            >
              {t.common.remove}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => add()}>
            {t.form.addAlternative}
          </Button>
          {!alternatives.some((a) => a.name === t.form.doNothing) && (
            <Button variant="ghost" onClick={() => add(t.form.doNothing)}>
              {t.form.addDoNothing}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ArgumentsEditor({
  title,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  items: Argument[];
  onChange: (items: Argument[]) => void;
  placeholder: string;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, { id: uid(), text: draft.trim(), weight: 2 }]);
    setDraft("");
  };

  return (
    <Card>
      <CardTitle hint={t.form.weightHint}>{title}</CardTitle>
      <ul className="mb-3 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm" title={it.text}>
              {it.text}
            </span>
            <select
              aria-label={t.form.weightLabel}
              value={it.weight}
              onChange={(e) =>
                onChange(items.map((x) => (x.id === it.id ? { ...x, weight: Number(e.target.value) } : x)))
              }
              className={`${inputClass} w-auto py-1`}
            >
              {[1, 2, 3].map((w) => (
                <option key={w} value={w}>
                  {t.form.weights[w]}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={t.settings.removeNamed(`“${it.text}”`)}
              onClick={() => onChange(items.filter((x) => x.id !== it.id))}
              className="px-1 text-muted hover:text-bad"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <TextInput
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
          {t.common.add}
        </Button>
      </div>
    </Card>
  );
}
