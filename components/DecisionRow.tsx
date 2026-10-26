"use client";

import Link from "next/link";
import { isDueForReview } from "@/lib/journal";
import type { Decision } from "@/lib/types";
import { choiceLabel } from "./JournalEntry";
import { Badge, CategoryLabel, ScorePill, formatDate } from "./ui";

export default function DecisionRow({ decision: d, score }: { decision: Decision; score: number }) {
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
          <span>· {formatDate(d.createdAt)}</span>
          {d.status !== "open" && <span>· {choiceLabel(d)}</span>}
        </div>
      </div>
      <div className="shrink-0">
        {d.review ? (
          <Badge tone={d.review.outcome >= 4 ? "good" : d.review.outcome <= 2 ? "bad" : "info"}>
            outcome {d.review.outcome}/5
          </Badge>
        ) : isDueForReview(d) ? (
          <Badge tone="warn">review due</Badge>
        ) : (
          <Badge tone="info">{d.status}</Badge>
        )}
      </div>
    </Link>
  );
}
