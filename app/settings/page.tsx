"use client";

import { useRef, useState } from "react";
import { Button, Card, CardTitle, Field, Loading, NumberInput, TextInput, inputClass } from "@/components/ui";
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
} from "@/lib/store";
import type { Priority, Profile } from "@/lib/types";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "SGD", "AED"];

export default function SettingsPage() {
  const hydrated = useHydrated();
  const { settings, decisions } = useAppState();
  const [newPriority, setNewPriority] = useState("");
  const [message, setMessage] = useState("");
  const [passcode, setPasscodeDraft] = useState(getPasscode);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!hydrated) return <Loading />;

  const { profile, priorities } = settings;
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
      setMessage("Imported successfully.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Changes save automatically and stay in this browser.</p>
      </div>

      <Card>
        <CardTitle hint="Used to judge affordability and opportunity cost. Rough numbers are fine.">
          Your financial picture
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency">
            <select value={profile.currency} onChange={(e) => setProfile({ currency: e.target.value })} className={inputClass}>
              {[...new Set([profile.currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monthly savings" hint="what you can set aside each month">
            <NumberInput
              prefix={profile.currency}
              min={0}
              value={profile.monthlySavings}
              onChange={(n) => setProfile({ monthlySavings: Math.max(0, n) })}
            />
          </Field>
          <Field label="Take-home pay per hour" hint="turns prices into hours of work">
            <NumberInput
              prefix={profile.currency}
              min={0}
              value={profile.hourlyIncome}
              onChange={(n) => setProfile({ hourlyIncome: Math.max(0, n) })}
            />
          </Field>
          <Field label="Expected investment return" hint="% per year">
            <NumberInput
              step={0.5}
              value={profile.investmentReturn}
              onChange={(n) => setProfile({ investmentReturn: n })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle hint="What matters to you, and how much. Every decision gets scored against these.">
          Your priorities
        </CardTitle>
        <ul className="space-y-2">
          {[...priorities]
            .sort((a, b) => b.weight - a.weight)
            .map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <TextInput
                  aria-label="Priority name"
                  value={p.name}
                  onChange={(e) =>
                    setPriorities(priorities.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
                  }
                />
                <div className="flex shrink-0" role="radiogroup" aria-label={`Importance of ${p.name}`}>
                  {[1, 2, 3, 4, 5].map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={p.weight === w}
                      aria-label={`${w} of 5`}
                      onClick={() => setPriorities(priorities.map((x) => (x.id === p.id ? { ...x, weight: w } : x)))}
                      className={`px-0.5 text-lg leading-none ${w <= p.weight ? "text-warn" : "text-border"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setPriorities(priorities.filter((x) => x.id !== p.id))}
                  className="px-2 text-muted hover:text-bad"
                >
                  ×
                </button>
              </li>
            ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <TextInput
            placeholder="Add a priority, e.g. Living near family"
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
            Add
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle hint="Claude can review a decision and point out what the numbers miss.">AI second opinion</CardTitle>
        <Field
          label="Passcode"
          hint="only needed if the server sets SECOND_OPINION_PASSCODE; stays in this browser"
        >
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
        <p className="mt-3 text-xs text-muted">
          Asking for a second opinion sends that one decision, your financial settings and priorities, and up to three
          similar past decisions to Anthropic&apos;s API. Nothing is sent unless you press “Ask Claude”.
        </p>
      </Card>

      <Card>
        <CardTitle hint={`${decisions.length} decision${decisions.length === 1 ? "" : "s"} stored in this browser.`}>
          Your data
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            Export backup
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import backup
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
            Load example decisions
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm("Delete all decisions and settings from this browser? Export a backup first if unsure.")) {
                resetAll();
                setMessage("Everything was cleared.");
              }
            }}
          >
            Delete everything
          </Button>
        </div>
        {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      </Card>
    </div>
  );
}
