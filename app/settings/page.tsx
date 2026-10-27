"use client";

import { useMemo, useRef, useState } from "react";
import { LanguageSelect } from "@/components/Nav";
import { Button, Card, CardTitle, Field, Loading, NumberInput, TextInput, inputClass } from "@/components/ui";
import { formatMoney } from "@/lib/engine";
import { currencyOptions, currencySymbol, priorityName } from "@/lib/i18n";
import {
  exportJson,
  getPasscode,
  importJson,
  loadExamples,
  resetAll,
  saveSettings,
  setPasscode,
  uid,
  useAppState,
  useHydrated,
  useT,
} from "@/lib/store";
import type { Priority, Profile } from "@/lib/types";

type Message = "imported" | "importFailed" | "importInvalid" | "cleared";

export default function SettingsPage() {
  const hydrated = useHydrated();
  const { settings, decisions } = useAppState();
  const t = useT();
  const [newPriority, setNewPriority] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [passcode, setPasscodeDraft] = useState(getPasscode);
  const fileRef = useRef<HTMLInputElement>(null);
  const currencies = useMemo(() => currencyOptions(settings.locale), [settings.locale]);

  if (!hydrated) return <Loading />;

  const { profile, priorities, locale } = settings;
  const symbol = currencySymbol(profile.currency, locale);
  const setProfile = (patch: Partial<Profile>) => saveSettings({ ...settings, profile: { ...profile, ...patch } });
  const setPriorities = (next: Priority[]) => saveSettings({ ...settings, priorities: next });

  const addPriority = () => {
    if (!newPriority.trim()) return;
    setPriorities([...priorities, { id: uid(), name: newPriority.trim(), weight: 3 }]);
    setNewPriority("");
  };

  const download = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decision-journal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    try {
      importJson(await file.text());
      setMessage("imported");
    } catch (e) {
      // Unreadable JSON vs. valid JSON that isn't one of our exports.
      setMessage(e instanceof SyntaxError ? "importFailed" : "importInvalid");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-muted">{t.settings.subtitle}</p>
      </div>

      <Card>
        <CardTitle hint={t.settings.localeHint}>{t.settings.localeTitle}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.common.language}>
            <LanguageSelect className={inputClass} />
          </Field>
          <Field label={t.settings.currency} hint={formatMoney(1234567, profile.currency, locale)}>
            <select
              value={profile.currency}
              onChange={(e) => setProfile({ currency: e.target.value })}
              className={inputClass}
            >
              {!currencies.some((c) => c.code === profile.currency) && (
                <option value={profile.currency}>{profile.currency}</option>
              )}
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle hint={t.settings.financeHint}>{t.settings.financeTitle}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.savings} hint={t.settings.savingsHint}>
            <NumberInput
              prefix={symbol}
              min={0}
              value={profile.monthlySavings}
              onChange={(n) => setProfile({ monthlySavings: Math.max(0, n) })}
            />
          </Field>
          <Field label={t.settings.hourly} hint={t.settings.hourlyHint}>
            <NumberInput
              prefix={symbol}
              min={0}
              value={profile.hourlyIncome}
              onChange={(n) => setProfile({ hourlyIncome: Math.max(0, n) })}
            />
          </Field>
          <Field label={t.settings.returnRate} hint={t.settings.returnRateHint}>
            <NumberInput
              step={0.5}
              value={profile.investmentReturn}
              onChange={(n) => setProfile({ investmentReturn: n })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle hint={t.settings.prioritiesHint}>{t.settings.prioritiesTitle}</CardTitle>
        <ul className="space-y-2">
          {[...priorities]
            .sort((a, b) => b.weight - a.weight)
            .map((p) => {
              const name = priorityName(p, t);
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <TextInput
                    aria-label={t.settings.priorityName}
                    value={name}
                    onChange={(e) =>
                      setPriorities(priorities.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <div className="flex shrink-0" role="radiogroup" aria-label={t.settings.importanceOf(name)}>
                    {[1, 2, 3, 4, 5].map((w) => (
                      <button
                        key={w}
                        type="button"
                        role="radio"
                        aria-checked={p.weight === w}
                        aria-label={t.settings.outOf5(w)}
                        onClick={() =>
                          setPriorities(priorities.map((x) => (x.id === p.id ? { ...x, weight: w } : x)))
                        }
                        className={`px-0.5 text-lg leading-none ${w <= p.weight ? "text-warn" : "text-border"}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={t.settings.removeNamed(name)}
                    onClick={() => setPriorities(priorities.filter((x) => x.id !== p.id))}
                    className="px-2 text-muted hover:text-bad"
                  >
                    ×
                  </button>
                </li>
              );
            })}
        </ul>
        <div className="mt-3 flex gap-2">
          <TextInput
            placeholder={t.settings.addPriority}
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPriority();
              }
            }}
          />
          <Button variant="secondary" onClick={addPriority} disabled={!newPriority.trim()}>
            {t.common.add}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle hint={t.settings.aiHint}>{t.settings.aiTitle}</CardTitle>
        <Field label={t.settings.passcode} hint={t.settings.passcodeHint}>
          <TextInput
            type="password"
            autoComplete="off"
            value={passcode}
            onChange={(e) => {
              setPasscodeDraft(e.target.value);
              setPasscode(e.target.value);
            }}
          />
        </Field>
        <p className="mt-3 text-xs text-muted">{t.settings.aiPrivacy}</p>
      </Card>

      <Card>
        <CardTitle hint={t.settings.dataHint(decisions.length)}>{t.settings.dataTitle}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            {t.settings.export}
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            {t.settings.import}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" onClick={loadExamples}>
            {t.settings.loadExamples}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm(t.settings.deleteAllConfirm)) {
                resetAll();
                setMessage("cleared");
              }
            }}
          >
            {t.settings.deleteAll}
          </Button>
        </div>
        {message && <p className="mt-3 text-sm text-muted">{t.settings[message]}</p>}
      </Card>
    </div>
  );
}
