"use client";

import { useState } from "react";
import DecisionForm from "@/components/DecisionForm";
import { Loading } from "@/components/ui";
import { blankDecision } from "@/lib/defaults";
import { uid, useHydrated } from "@/lib/store";

export default function NewDecisionPage() {
  const hydrated = useHydrated();
  const [initial] = useState(() => blankDecision(uid()));
  if (!hydrated) return <Loading />;
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New decision</h1>
      <DecisionForm initial={initial} />
    </>
  );
}
