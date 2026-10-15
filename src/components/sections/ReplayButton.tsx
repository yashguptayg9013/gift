"use client";

import { RotateCcw } from "lucide-react";
import { replayExperience } from "@/lib/experience";

export function ReplayButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={replayExperience}
      className="group inline-flex h-12 items-center gap-4 border border-line-strong px-6 text-silver transition-colors duration-500 hover:border-silver hover:text-white"
    >
      <RotateCcw
        aria-hidden
        size={15}
        strokeWidth={1.25}
        className="transition-transform duration-700 ease-[var(--ease-reveal)] group-hover:-rotate-180"
      />
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.24em]">{label}</span>
    </button>
  );
}
