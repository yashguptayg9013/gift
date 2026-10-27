"use client";

import Link from "next/link";
import { useState } from "react";
import { buildBrief } from "@/lib/brief";
import type { Evaluation } from "@/lib/engine";
import { getPasscode, saveDecision, useT } from "@/lib/store";
import type { Decision, SecondOpinion, Settings } from "@/lib/types";
import { Badge, Button, Card, formatDate } from "./ui";

const STANCE_TONE: Record<SecondOpinion["stance"], "good" | "info" | "warn"> = {
  agree: "good",
  partly_agree: "info",
  disagree: "warn",
};

const SECTIONS = ["blindSpots", "risks", "questions", "alternatives"] as const;

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
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const opinion = decision.secondOpinion;

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/second-opinion", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": getPasscode() },
        body: JSON.stringify({ brief: buildBrief(decision, settings, ev), locale: settings.locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.code === "string" ? data.code : "unknown");
        return;
      }
      saveDecision({
        ...decision,
        secondOpinion: { ...data.opinion, model: data.model, createdAt: new Date().toISOString(), engineScore: ev.score },
      });
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t.opinion.title}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {opinion
              ? t.opinion.givenAt(formatDate(opinion.createdAt, settings.locale), opinion.engineScore)
              : t.opinion.intro}
          </p>
        </div>
        <Button variant={opinion ? "secondary" : "primary"} onClick={ask} disabled={loading}>
          {loading ? t.opinion.thinking : opinion ? t.opinion.askAgain : t.opinion.ask}
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted">{t.opinion.thinkingLong}</p>
      )}

      {error && (
        <div className="rounded-md bg-bad-soft p-3 text-sm text-bad" role="alert">
          {t.opinion.errors[error] ?? t.opinion.errors.unknown}
          {error === "bad_passcode" && (
            <>
              {" "}
              <Link href="/settings" className="underline">
                {t.opinion.openSettings}
              </Link>
            </>
          )}
        </div>
      )}

      {opinion && !loading && (
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={STANCE_TONE[opinion.stance]}>{t.opinion.stance[opinion.stance]}</Badge>
              <Badge tone="info">{t.opinion.confidence[opinion.confidence]}</Badge>
            </div>
            <p className="mt-2 font-medium">{opinion.recommendation}</p>
            <p className="mt-1 text-sm">{opinion.summary}</p>
          </div>
          {SECTIONS.filter((key) => opinion[key].length > 0).map((key) => (
            <div key={key}>
              <div className="text-xs uppercase tracking-wide text-muted">{t.opinion.sections[key]}</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {opinion[key].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!opinion && !loading && (
        <p className="text-xs text-muted">{t.opinion.privacy}</p>
      )}
      {opinion && !loading && <p className="mt-4 text-xs text-muted">{t.opinion.answeredBy(opinion.model)}</p>}
    </Card>
  );
}
