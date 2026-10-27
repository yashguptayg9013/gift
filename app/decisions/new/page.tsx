"use client";

import { useState } from "react";
import DecisionForm from "@/components/DecisionForm";
import { Loading } from "@/components/ui";
import { blankDecision } from "@/lib/defaults";
import { uid, useHydrated, useT } from "@/lib/store";

export default function NewDecisionPage() {
  const hydrated = useHydrated();
  const t = useT();
  const [initial] = useState(() => blankDecision(uid()));
  if (!hydrated) return <Loading />;
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t.form.newTitle}</h1>
      <DecisionForm initial={initial} />
    </>
  );
}
