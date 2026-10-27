"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { saveDecision, useAppState, useT } from "@/lib/store";
import type { Choice, Decision, Verdict } from "@/lib/types";
import { Badge, Button, Card, CardTitle, Field, Slider, TextArea, formatDate, inputClass } from "./ui";

/** Quick picks for the review date; labels come from `decide.reviewIn` in the same order. */
const REVIEW_IN_MONTHS = [1, 3, 6, 12];

function monthsFromNow(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function choiceLabel(d: Decision, t: Dict) {
  switch (d.choice) {
    case "yes":
      return t.choice.yes;
    case "no":
      return t.choice.no;
    case "alternative":
      return t.choice.alternative(d.alternatives.find((a) => a.id === d.chosenAlternativeId)?.name ?? "—");
    case "deferred":
      return t.choice.deferred;
    default:
      return t.choice.undecided;
  }
}

export function DecidePanel({ decision, score }: { decision: Decision; score: number }) {
  const t = useT();
  const [choice, setChoice] = useState<Choice>(score >= 50 ? "yes" : "no");
  const [altId, setAltId] = useState(decision.alternatives[0]?.id ?? "");
  const [rationale, setRationale] = useState("");
  const [expected, setExpected] = useState("");
  const [reviewAt, setReviewAt] = useState(monthsFromNow(3));

  const options: { value: Choice; label: string }[] = [
    { value: "yes", label: t.decide.yes },
    { value: "no", label: t.decide.no },
    ...(decision.alternatives.length ? [{ value: "alternative" as Choice, label: t.decide.alternative }] : []),
    { value: "deferred", label: t.decide.notNow },
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
      <CardTitle hint={t.decide.hint}>{t.decide.title}</CardTitle>
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
          <Field label={t.decide.whichOne}>
            <select value={altId} onChange={(e) => setAltId(e.target.value)} className={inputClass}>
              {decision.alternatives.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || t.common.untitled}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t.decide.why} hint={t.decide.whyHint}>
          <TextArea value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </Field>
        <Field label={t.decide.expect} hint={t.decide.expectHint}>
          <TextArea rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label={t.decide.reviewOn}>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} className={`${inputClass} w-auto`} />
            {REVIEW_IN_MONTHS.map((months, i) => (
              <button
                key={months}
                type="button"
                onClick={() => setReviewAt(monthsFromNow(months))}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
              >
                {t.decide.reviewIn[i]}
              </button>
            ))}
          </div>
        </Field>
        <Button onClick={commit}>{t.decide.record}</Button>
      </div>
    </Card>
  );
}

const VERDICTS: { value: Verdict; tone: "good" | "warn" | "bad" | "info" }[] = [
  { value: "right", tone: "good" },
  { value: "unlucky", tone: "info" },
  { value: "lucky", tone: "warn" },
  { value: "wrong", tone: "bad" },
];

export function DecisionRecord({ decision, onReopen }: { decision: Decision; onReopen: () => void }) {
  const t = useT();
  const { locale } = useAppState().settings;
  const [reviewing, setReviewing] = useState(false);
  const due = decision.status === "decided" && decision.reviewAt && new Date(decision.reviewAt) <= new Date();

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t.decide.yourDecision}</h2>
          {decision.decidedAt && <span className="text-xs text-muted">{formatDate(decision.decidedAt, locale)}</span>}
        </div>
        <p className="text-lg font-medium">{choiceLabel(decision, t)}</p>
        {decision.rationale && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-muted">{t.decide.reasoning}</div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{decision.rationale}</p>
          </div>
        )}
        {decision.expectedOutcome && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-muted">{t.decide.expectedOutcome}</div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{decision.expectedOutcome}</p>
          </div>
        )}
        {decision.status === "decided" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {decision.reviewAt && (
              <span className="mr-auto text-sm text-muted">
                {due ? (
                  <Badge tone="warn">{t.decide.reviewDueBadge}</Badge>
                ) : (
                  t.decide.reviewOnDate(formatDate(decision.reviewAt, locale))
                )}
              </span>
            )}
            <Button variant="ghost" onClick={onReopen}>
              {t.decide.reopen}
            </Button>
            {!reviewing && (
              <Button variant={due ? "primary" : "secondary"} onClick={() => setReviewing(true)}>
                {due ? t.decide.reviewNow : t.decide.reviewEarly}
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
  const t = useT();

  const submit = () =>
    saveDecision({
      ...decision,
      status: "reviewed",
      review: { reviewedAt: new Date().toISOString(), outcome, wouldDecideSame: same, verdict, lessons: lessons.trim() },
    });

  return (
    <Card className="border-accent/40">
      <CardTitle hint={t.review.hint}>{t.review.title}</CardTitle>
      <div className="space-y-5">
        {decision.expectedOutcome && (
          <p className="rounded-md bg-background p-3 text-sm">
            <span className="text-muted">{t.review.youExpected}</span>
            {decision.expectedOutcome}
          </p>
        )}
        <Field label={t.review.howDidItGo}>
          <Slider
            min={1}
            max={5}
            value={outcome}
            onChange={setOutcome}
            left={t.review.terrible}
            right={t.review.great}
            display={`${outcome}/5`}
          />
        </Field>
        <Field label={t.review.sameAgain}>
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
                {v ? t.common.yes : t.common.no}
              </button>
            ))}
          </div>
        </Field>
        <div>
          <span className="text-sm font-medium">{t.review.reasoningCorrect}</span>
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
                <div className="text-sm font-medium">{t.review.verdicts[v.value].title}</div>
                <div className="text-xs text-muted">{t.review.verdicts[v.value].text}</div>
              </button>
            ))}
          </div>
        </div>
        <Field label={t.review.lessons} hint={t.review.lessonsHint}>
          <TextArea value={lessons} onChange={(e) => setLessons(e.target.value)} />
        </Field>
        <Button onClick={submit}>{t.review.save}</Button>
      </div>
    </Card>
  );
}

function ReviewRecord({ decision }: { decision: Decision }) {
  const r = decision.review!;
  const v = VERDICTS.find((x) => x.value === r.verdict)!;
  const t = useT();
  const { locale } = useAppState().settings;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t.review.lookingBack}</h2>
        <span className="text-xs text-muted">{formatDate(r.reviewedAt, locale)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={v.tone}>{t.review.verdicts[v.value].title}</Badge>
        <Badge tone={r.outcome >= 4 ? "good" : r.outcome <= 2 ? "bad" : "info"}>{t.review.outcomeBadge(r.outcome)}</Badge>
        <Badge tone={r.wouldDecideSame ? "good" : "warn"}>
          {r.wouldDecideSame ? t.review.wouldSame : t.review.wouldDifferent}
        </Badge>
      </div>
      {r.lessons && (
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-muted">{t.review.lessons}</div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.lessons}</p>
        </div>
      )}
    </Card>
  );
}
