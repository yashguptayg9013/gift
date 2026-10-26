"use client";

import { useState } from "react";
import { saveDecision } from "@/lib/store";
import type { Choice, Decision, Verdict } from "@/lib/types";
import { Badge, Button, Card, CardTitle, Field, Slider, TextArea, formatDate, inputClass } from "./ui";

const REVIEW_IN = [
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
];

function monthsFromNow(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function choiceLabel(d: Decision) {
  switch (d.choice) {
    case "yes":
      return "Yes, went ahead";
    case "no":
      return "No, passed";
    case "alternative":
      return `Chose an alternative: ${d.alternatives.find((a) => a.id === d.chosenAlternativeId)?.name ?? "—"}`;
    case "deferred":
      return "Deferred for now";
    default:
      return "Undecided";
  }
}

export function DecidePanel({ decision, score }: { decision: Decision; score: number }) {
  const [choice, setChoice] = useState<Choice>(score >= 50 ? "yes" : "no");
  const [altId, setAltId] = useState(decision.alternatives[0]?.id ?? "");
  const [rationale, setRationale] = useState("");
  const [expected, setExpected] = useState("");
  const [reviewAt, setReviewAt] = useState(monthsFromNow(3));

  const options: { value: Choice; label: string }[] = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    ...(decision.alternatives.length ? [{ value: "alternative" as Choice, label: "An alternative" }] : []),
    { value: "deferred", label: "Not now" },
  ];

  const commit = () =>
    saveDecision({
      ...decision,
      status: "decided",
      choice,
      chosenAlternativeId: choice === "alternative" ? altId : undefined,
      rationale: rationale.trim(),
      expectedOutcome: expected.trim(),
      reviewAt,
      decidedAt: new Date().toISOString(),
      scoreAtDecision: score,
    });

  return (
    <Card className="border-accent/40">
      <CardTitle hint="Writing down your reasoning now is what makes the journal useful later.">
        Make the call
      </CardTitle>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setChoice(o.value)}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                choice === o.value ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-background"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {choice === "alternative" && (
          <Field label="Which one?">
            <select value={altId} onChange={(e) => setAltId(e.target.value)} className={inputClass}>
              {decision.alternatives.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || "Untitled"}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Why?" hint="the reasoning you want to check later">
          <TextArea value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </Field>
        <Field label="What do you expect to happen?" hint="a concrete, checkable prediction">
          <TextArea rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label="Review it on">
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} className={`${inputClass} w-auto`} />
            {REVIEW_IN.map((r) => (
              <button
                key={r.months}
                type="button"
                onClick={() => setReviewAt(monthsFromNow(r.months))}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
              >
                in {r.label}
              </button>
            ))}
          </div>
        </Field>
        <Button onClick={commit}>Record decision</Button>
      </div>
    </Card>
  );
}

const VERDICTS: { value: Verdict; title: string; text: string; tone: "good" | "warn" | "bad" | "info" }[] = [
  { value: "right", title: "Right call", text: "Sound reasoning, good result", tone: "good" },
  { value: "unlucky", title: "Unlucky", text: "Sound reasoning, bad result", tone: "info" },
  { value: "lucky", title: "Got lucky", text: "Weak reasoning, good result", tone: "warn" },
  { value: "wrong", title: "Wrong call", text: "Weak reasoning, bad result", tone: "bad" },
];

export function DecisionRecord({ decision, onReopen }: { decision: Decision; onReopen: () => void }) {
  const [reviewing, setReviewing] = useState(false);
  const due = decision.status === "decided" && decision.reviewAt && new Date(decision.reviewAt) <= new Date();

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Your decision</h2>
          {decision.decidedAt && <span className="text-xs text-muted">{formatDate(decision.decidedAt)}</span>}
        </div>
        <p className="text-lg font-medium">{choiceLabel(decision)}</p>
        {decision.rationale && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-muted">Reasoning</div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{decision.rationale}</p>
          </div>
        )}
        {decision.expectedOutcome && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-muted">Expected outcome</div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{decision.expectedOutcome}</p>
          </div>
        )}
        {decision.status === "decided" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {decision.reviewAt && (
              <span className="mr-auto text-sm text-muted">
                {due ? <Badge tone="warn">Review due</Badge> : `Review on ${formatDate(decision.reviewAt)}`}
              </span>
            )}
            <Button variant="ghost" onClick={onReopen}>
              Reopen
            </Button>
            {!reviewing && (
              <Button variant={due ? "primary" : "secondary"} onClick={() => setReviewing(true)}>
                {due ? "Review now" : "Review early"}
              </Button>
            )}
          </div>
        )}
      </Card>
      {reviewing && decision.status === "decided" && <ReviewPanel decision={decision} />}
      {decision.review && <ReviewRecord decision={decision} />}
    </>
  );
}

function ReviewPanel({ decision }: { decision: Decision }) {
  const [outcome, setOutcome] = useState(3);
  const [same, setSame] = useState(true);
  const [verdict, setVerdict] = useState<Verdict>("right");
  const [lessons, setLessons] = useState("");

  const submit = () =>
    saveDecision({
      ...decision,
      status: "reviewed",
      review: { reviewedAt: new Date().toISOString(), outcome, wouldDecideSame: same, verdict, lessons: lessons.trim() },
    });

  return (
    <Card className="border-accent/40">
      <CardTitle hint="Judge the reasoning separately from the result — good decisions can still turn out badly.">
        Look back
      </CardTitle>
      <div className="space-y-5">
        {decision.expectedOutcome && (
          <p className="rounded-md bg-background p-3 text-sm">
            <span className="text-muted">You expected: </span>
            {decision.expectedOutcome}
          </p>
        )}
        <Field label="How did it actually turn out?">
          <Slider
            min={1}
            max={5}
            value={outcome}
            onChange={setOutcome}
            left="Terrible"
            right="Great"
            display={`${outcome}/5`}
          />
        </Field>
        <Field label="Knowing what you know now, would you decide the same way?">
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setSame(v)}
                className={`rounded-md border px-4 py-2 text-sm font-medium ${
                  same === v ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-background"
                }`}
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </Field>
        <div>
          <span className="text-sm font-medium">Was your reasoning correct?</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {VERDICTS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVerdict(v.value)}
                className={`rounded-lg border p-3 text-left ${
                  verdict === v.value ? "border-accent bg-accent-soft" : "border-border hover:bg-background"
                }`}
              >
                <div className="text-sm font-medium">{v.title}</div>
                <div className="text-xs text-muted">{v.text}</div>
              </button>
            ))}
          </div>
        </div>
        <Field label="Lessons" hint="shown again when you face a similar decision">
          <TextArea value={lessons} onChange={(e) => setLessons(e.target.value)} />
        </Field>
        <Button onClick={submit}>Save review</Button>
      </div>
    </Card>
  );
}

function ReviewRecord({ decision }: { decision: Decision }) {
  const r = decision.review!;
  const v = VERDICTS.find((x) => x.value === r.verdict)!;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Looking back</h2>
        <span className="text-xs text-muted">{formatDate(r.reviewedAt)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={v.tone}>{v.title}</Badge>
        <Badge tone={r.outcome >= 4 ? "good" : r.outcome <= 2 ? "bad" : "info"}>Outcome {r.outcome}/5</Badge>
        <Badge tone={r.wouldDecideSame ? "good" : "warn"}>
          {r.wouldDecideSame ? "Would decide the same" : "Would decide differently"}
        </Badge>
      </div>
      {r.lessons && (
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-muted">Lessons</div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.lessons}</p>
        </div>
      )}
    </Card>
  );
}
