"use client";

import { useRef, useState } from "react";
import { Heart } from "./Heart";

type Burst = { id: number; left: number; size: number; delay: number; duration: number };

export function Question({
  yes,
  no,
  answer,
}: {
  yes: string;
  no: string;
  answer: string;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [noPos, setNoPos] = useState<{ x: number; y: number } | null>(null);
  const [said, setSaid] = useState(false);
  const [hearts, setHearts] = useState<Burst[]>([]);

  const runAway = () => {
    const area = areaRef.current;
    if (!area) return;
    const w = area.clientWidth - 120;
    const h = area.clientHeight - 56;
    setNoPos({ x: Math.random() * Math.max(w, 0), y: Math.random() * Math.max(h, 0) });
  };

  const sayYes = () => {
    setSaid(true);
    setHearts(
      Array.from({ length: 36 }, (_, i) => ({
        id: Date.now() + i,
        left: Math.random() * 100,
        size: 16 + Math.random() * 36,
        delay: Math.random() * 1.2,
        duration: 3 + Math.random() * 3,
      })),
    );
  };

  return (
    <>
      {said ? (
        <p className="font-script text-4xl text-rose-deep md:text-5xl" role="status">
          {answer}
        </p>
      ) : (
        <div ref={areaRef} className="relative h-40 w-full max-w-xl">
          <div className="absolute inset-0 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={sayYes}
              className="rounded-full bg-rose px-9 py-[18px] font-semibold text-white shadow-[0_10px_24px_rgba(232,83,107,0.3)] transition hover:-translate-y-0.5 hover:bg-rose-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose"
            >
              {yes}
            </button>
            {!noPos && (
              <button
                type="button"
                onMouseEnter={runAway}
                onFocus={runAway}
                onTouchStart={runAway}
                onClick={runAway}
                className="rounded-full border border-muted/40 bg-white px-9 py-[18px] font-semibold text-muted"
              >
                {no}
              </button>
            )}
          </div>
          {noPos && (
            <button
              type="button"
              onMouseEnter={runAway}
              onFocus={runAway}
              onTouchStart={runAway}
              onClick={runAway}
              style={{ left: noPos.x, top: noPos.y }}
              className="absolute rounded-full border border-muted/40 bg-white px-9 py-[18px] font-semibold text-muted transition-[left,top] duration-300"
            >
              {no}
            </button>
          )}
        </div>
      )}
      {!said && (
        <p className="text-sm text-muted">
          (Psst... the &ldquo;{no}&rdquo; button is shy. It runs away when you try to click it.)
        </p>
      )}

      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
        {hearts.map((h) => (
          <Heart
            key={h.id}
            size={h.size}
            className="absolute -bottom-16 text-rose"
            style={{
              left: `${h.left}%`,
              animation: `rise ${h.duration}s ease-out ${h.delay}s forwards`,
              opacity: 0,
            }}
          />
        ))}
      </div>
    </>
  );
}
