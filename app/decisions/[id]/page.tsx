"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  AlternativesTable,
  DimensionBreakdown,
  EvaluationSummary,
  InsightList,
  MoneyPanel,
  ProsCons,
  SimilarDecisions,
} from "@/components/Evaluation";
import { DecidePanel, DecisionRecord } from "@/components/JournalEntry";
import { Badge, Button, ButtonLink, CategoryLabel, Loading, formatDate } from "@/components/ui";
import { evaluate } from "@/lib/engine";
import { deleteDecision, saveDecision, useAppState, useHydrated } from "@/lib/store";

const STATUS_TONE = { open: "info", decided: "warn", reviewed: "good" } as const;

export default function DecisionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const { decisions, settings } = useAppState();
  const decision = decisions.find((d) => d.id === id);
  const ev = useMemo(
    () => (decision ? evaluate(decision, settings, decisions) : null),
    [decision, settings, decisions],
  );

  if (!hydrated) return <Loading />;
  if (!decision || !ev) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-muted">That decision doesn&apos;t exist (anymore).</p>
        <ButtonLink href="/">Back to dashboard</ButtonLink>
      </div>
    );
  }

  const remove = () => {
    if (window.confirm(`Delete “${decision.title}”? This can't be undone.`)) {
      deleteDecision(decision.id);
      router.push("/journal");
    }
  };

  const reopen = () =>
    saveDecision({
      ...decision,
      status: "open",
      choice: undefined,
      chosenAlternativeId: undefined,
      decidedAt: undefined,
      scoreAtDecision: undefined,
    });

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <CategoryLabel category={decision.category} />
          <Badge tone={STATUS_TONE[decision.status]}>{decision.status}</Badge>
          <span className="text-xs text-muted">· {formatDate(decision.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{decision.title}</h1>
          <div className="flex gap-1">
            <ButtonLink variant="secondary" href={`/decisions/${decision.id}/edit`}>
              Edit
            </ButtonLink>
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          </div>
        </div>
        {decision.context && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{decision.context}</p>}
      </div>

      <EvaluationSummary decision={decision} ev={ev} />
      <MoneyPanel decision={decision} ev={ev} settings={settings} />
      <InsightList insights={ev.insights} />
      <DimensionBreakdown ev={ev} />
      <AlternativesTable decision={decision} settings={settings} />
      <ProsCons decision={decision} />
      <SimilarDecisions ev={ev} />

      {decision.status === "open" ? (
        <DecidePanel key={decision.updatedAt} decision={decision} score={ev.score} />
      ) : (
        <DecisionRecord decision={decision} onReopen={reopen} />
      )}
    </div>
  );
}
