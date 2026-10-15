import { cn } from "@/lib/cn";

/** Small chapter marker: "04 — The Details" with a short rule. */
export function Chapter({ children, className }: { children: string; className?: string }) {
  return (
    <p data-reveal="fade" className={cn("t-label flex items-center gap-3", className)}>
      <span aria-hidden className="inline-block h-px w-8 bg-crimson" />
      {children}
    </p>
  );
}
