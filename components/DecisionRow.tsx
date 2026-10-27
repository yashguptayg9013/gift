"use client";

import Link from "next/link";
import { isDueForReview } from "@/lib/journal";
import { useAppState, useT } from "@/lib/store";
import type { Decision } from "@/lib/types";
import { choiceLabel } from "./JournalEntry";
import { Badge, CategoryLabel, ScorePill, formatDate } from "./ui";

export default function DecisionRow({ decision: d, score }: { decision: Decision; score: number }) {
  const t = useT();
  const { locale } = useAppState().settings;
  return (
    <Link
      href={`/decisions/${d.id}`}
      className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-background"
    >
      <ScorePill score={d.scoreAtDecision ?? score} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{d.title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <CategoryLabel category={d.category} />
          <span>· {formatDate(d.createdAt, locale)}</span>
          {d.status !== "open" && <span>· {choiceLabel(d, t)}</span>}
        </div>
      </div>
      <div className="shrink-0">
        {d.review ? (
          <Badge tone={d.review.outcome >= 4 ? "good" : d.review.outcome <= 2 ? "bad" : "info"}>
            {t.outcome(d.review.outcome)}
          </Badge>
        ) : isDueForReview(d) ? (
          <Badge tone="warn">{t.reviewDue}</Badge>
        ) : (
          <Badge tone="info">{t.status[d.status]}</Badge>
        )}
      </div>
    </Link>
  );
}
