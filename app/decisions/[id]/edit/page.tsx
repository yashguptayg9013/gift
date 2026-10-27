"use client";

import { useParams } from "next/navigation";
import DecisionForm from "@/components/DecisionForm";
import { ButtonLink, Loading } from "@/components/ui";
import { useAppState, useHydrated, useT } from "@/lib/store";

export default function EditDecisionPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { decisions } = useAppState();
  const t = useT();
  const decision = decisions.find((d) => d.id === id);

  if (!hydrated) return <Loading />;
  if (!decision) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-muted">{t.common.notFound}</p>
        <ButtonLink href="/">{t.common.backToDashboard}</ButtonLink>
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t.form.editTitle}</h1>
      <DecisionForm key={decision.id} initial={decision} />
    </>
  );
}
