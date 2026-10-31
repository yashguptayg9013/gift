export function CountBox({
  value,
  label,
  className = "bg-white",
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex w-[76px] flex-col items-center gap-1 rounded-2xl border-[1.5px] border-blush py-4 sm:w-[150px] sm:rounded-[20px] sm:py-[22px] ${className}`}
    >
      <span className="font-display text-2xl font-bold text-rose tabular-nums sm:text-[44px] sm:leading-tight">
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted sm:text-[13px]">
        {label}
      </span>
    </div>
  );
}
