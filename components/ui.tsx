"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/engine";
import { CATEGORIES, type Category } from "@/lib/types";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface p-5 shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-background",
  ghost: "text-muted hover:text-foreground hover:bg-background",
  danger: "text-bad hover:bg-bad-soft",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function TextInput(props: ComponentProps<"input">) {
  return <input type="text" {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function NumberInput({
  value,
  onChange,
  prefix,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "prefix"> & {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        {...props}
        className={`${inputClass} ${prefix ? "pl-12" : ""} ${props.className ?? ""}`}
      />
    </div>
  );
}

export function TextArea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  left,
  right,
  display,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  left?: string;
  right?: string;
  display?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums">{display ?? value}</span>
      </div>
      {(left || right) && (
        <div className="mt-0.5 flex justify-between pr-17 text-xs text-muted">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

const TONE_STYLES: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_STYLES[tone]}`}>
      {children}
    </span>
  );
}

export function toneForScore(score: number): Tone {
  if (score >= 60) return "good";
  if (score >= 45) return "info";
  if (score >= 32) return "warn";
  return "bad";
}

const TONE_TEXT: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
};

const TONE_BG: Record<Tone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
};

export function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const tone = toneForScore(score);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative shrink-0 ${TONE_TEXT[tone]}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums text-foreground">{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">score</span>
      </div>
    </div>
  );
}

export function ScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return <div className="h-2 w-full rounded-full border border-dashed border-border" />;
  }
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border">
      <div className={`h-full rounded-full ${TONE_BG[toneForScore(score)]}`} style={{ width: `${score}%` }} />
    </div>
  );
}

export function ScorePill({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${TONE_STYLES[toneForScore(score)]}`}
    >
      {score}
    </span>
  );
}

export function CategoryLabel({ category }: { category: Category }) {
  const c = CATEGORIES.find((x) => x.value === category) ?? CATEGORIES[CATEGORIES.length - 1];
  return (
    <span className="text-xs text-muted">
      {c.emoji} {c.label}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
