"use client";

import Link from "next/link";
import { useState } from "react";
import { buildBrief } from "@/lib/brief";
import type { Evaluation } from "@/lib/engine";
import { getPasscode, saveDecision } from "@/lib/store";
import type { Decision, SecondOpinion, Settings } from "@/lib/types";
import { Badge, Button, Card, formatDate } from "./ui";

const STANCE: Record<SecondOpinion["stance"], { label: string; tone: "good" | "info" | "warn" }> = {
  agree: { label: "Agrees with the engine", tone: "good" },
  partly_agree: { label: "Partly agrees", tone: "info" },
  disagree: { label: "Disagrees with the engine", tone: "warn" },
};

const SECTIONS: { key: "blindSpots" | "risks" | "questions" | "alternatives"; title: string }[] = [
  { key: "blindSpots", title: "What the analysis might be missing" },
  { key: "risks", title: "Risks" },
  { key: "questions", title: "Ask yourself" },
  { key: "alternatives", title: "Other options to consider" },
];

export default function SecondOpinionPanel({
  decision,
  ev,
  settings,
}: {
  decision: Decision;
  ev: Evaluation;
  settings: Settings;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const opinion = decision.secondOpinion;

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/second-opinion", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": getPasscode() },
        body: JSON.stringify({ brief: buildBrief(decision, settings, ev) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: data.error ?? `Request failed (${res.status}).`, code: data.code });
        return;
      }
      saveDecision({
        ...decision,
        secondOpinion: { ...data.opinion, model: data.model, createdAt: new Date().toISOString(), engineScore: ev.score },
      });
    } catch {
      setError({ message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Claude&apos;s second opinion</h2>
          <p className="mt-0.5 text-sm text-muted">
            {opinion
              ? `${formatDate(opinion.createdAt)} · given when the engine scored ${opinion.engineScore}`
              : "A fresh pair of eyes on what the numbers can't see."}
          </p>
        </div>
        <Button variant={opinion ? "secondary" : "primary"} onClick={ask} disabled={loading}>
          {loading ? "Thinking…" : opinion ? "Ask again" : "Ask Claude"}
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted">Claude is thinking it through. This can take up to a minute.</p>
      )}

      {error && (
        <div className="rounded-md bg-bad-soft p-3 text-sm text-bad" role="alert">
          {error.message}
          {error.code === "bad_passcode" && (
            <>
              {" "}
              <Link href="/settings" className="underline">
                Open Settings
              </Link>
            </>
          )}
        </div>
      )}

      {opinion && !loading && (
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={STANCE[opinion.stance].tone}>{STANCE[opinion.stance].label}</Badge>
              <Badge tone="info">{opinion.confidence} confidence</Badge>
            </div>
            <p className="mt-2 font-medium">{opinion.recommendation}</p>
            <p className="mt-1 text-sm">{opinion.summary}</p>
          </div>
          {SECTIONS.filter((s) => opinion[s.key].length > 0).map((s) => (
            <div key={s.key}>
              <div className="text-xs uppercase tracking-wide text-muted">{s.title}</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {opinion[s.key].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!opinion && !loading && (
        <p className="text-xs text-muted">
          Sends this decision, your financial settings and priorities, and up to three similar past decisions to
          Anthropic&apos;s API. The rest of your journal stays in this browser.
        </p>
      )}
      {opinion && !loading && <p className="mt-4 text-xs text-muted">Answered by {opinion.model}. AI can be wrong — weigh it like any other advice.</p>}
    </Card>
  );
}
