import { cn } from "@/lib/cn";

/** "i20 AFTER DARK" set in two voices: condensed display + mono. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-2.5 leading-none", className)}>
      <span className="font-display text-[1.375rem] font-semibold tracking-[0.02em] text-white">i20</span>
      <span className="font-mono text-[0.625rem] tracking-[0.32em] text-silver/80">AFTER DARK</span>
    </span>
  );
}
