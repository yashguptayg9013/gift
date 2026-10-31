"use client";

import { useEffect, useState } from "react";
import { CountBox } from "./CountBox";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function split(ms: number): Parts {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/** The start date at local midnight. */
export function parseStart(startDate: string) {
  const [y, m, d] = startDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The next anniversary of startDate, at local midnight, that is still ahead of `now`. */
export function nextAnniversary(startDate: string, now = new Date()) {
  const start = parseStart(startDate);
  const next = new Date(now.getFullYear(), start.getMonth(), start.getDate());
  if (next <= now) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function LiveCounter({
  startDate,
  mode,
  boxClassName,
}: {
  startDate: string;
  mode: "since" | "until";
  boxClassName?: string;
}) {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ms =
        mode === "since"
          ? now.getTime() - parseStart(startDate).getTime()
          : nextAnniversary(startDate, now).getTime() - now.getTime();
      setParts(split(ms));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startDate, mode]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const items: [string, string][] = parts
    ? [
        [String(parts.days), "Days"],
        [pad(parts.hours), "Hours"],
        [pad(parts.minutes), "Minutes"],
        [pad(parts.seconds), "Seconds"],
      ]
    : [
        ["--", "Days"],
        ["--", "Hours"],
        ["--", "Minutes"],
        ["--", "Seconds"],
      ];

  return (
    <div className="flex gap-2 sm:gap-5" role="timer" aria-live="off">
      {items.map(([v, l]) => (
        <CountBox key={l} value={v} label={l} className={boxClassName} />
      ))}
    </div>
  );
}

export function AnniversaryDate({ startDate }: { startDate: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const d = nextAnniversary(startDate);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on the visitor's clock, so it must run on the client
    setLabel(
      d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    );
  }, [startDate]);
  return <>{label ?? "our next anniversary"}</>;
}
