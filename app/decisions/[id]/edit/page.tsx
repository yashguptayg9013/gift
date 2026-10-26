"use client";

import { useParams } from "next/navigation";
import DecisionForm from "@/components/DecisionForm";
import { ButtonLink, Loading } from "@/components/ui";
import { useAppState, useHydrated } from "@/lib/store";

export default function EditDecisionPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { decisions } = useAppState();
  const decision = decisions.find((d) => d.id === id);

  if (!hydrated) return <Loading />;
  if (!decision) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-muted">That decision doesn&apos;t exist (anymore).</p>
        <ButtonLink href="/">Back to dashboard</ButtonLink>
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit decision</h1>
      <DecisionForm key={decision.id} initial={decision} />
    </>
  );
}
