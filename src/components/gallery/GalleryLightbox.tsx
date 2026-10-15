"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { ResolvedImage } from "@/data/types";
import { Media } from "@/components/ui/Media";
import { lockScroll } from "@/lib/scroll";

type Item = { caption: string; image: ResolvedImage };

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Wraps the server-rendered grid and listens for clicks on
 * [data-gallery-open]. Keyboard: ←/→ to browse, Esc to close.
 * Touch: swipe sideways. Focus returns to the frame that opened it.
 */
export function GalleryLightbox({ items, children }: { items: Item[]; children: ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const open = index !== null;

  const go = useCallback(
    (step: number) => {
      setDirection(step);
      setIndex((i) => (i === null ? i : (i + step + items.length) % items.length));
    },
    [items.length],
  );

  const close = useCallback(() => {
    setIndex(null);
    opener.current?.focus();
  }, []);

  const onGridClick = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-gallery-open]");
    if (!button) return;
    opener.current = button;
    setDirection(0);
    setIndex(Number(button.dataset.galleryOpen));
  };

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Tab" && dialog.current) {
        const focusable = dialog.current.querySelectorAll<HTMLElement>("button");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lockScroll(false);
    };
  }, [open, close, go]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
  };

  const item = index !== null ? items[index] : null;

  return (
    <>
      <div onClick={onGridClick}>{children}</div>

      <AnimatePresence>
        {item && index !== null && (
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label={`Gallery — ${item.caption}`}
            className="fixed inset-0 z-[90] flex flex-col bg-obsidian/[0.97]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="frame flex h-[var(--nav-h)] shrink-0 items-center justify-between">
              <span className="t-label tabular-nums text-silver" aria-live="polite">
                {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                data-autofocus
                onClick={close}
                className="-mr-2 flex h-11 items-center gap-3 px-2 text-silver hover:text-white"
              >
                <span className="t-label text-inherit">Close</span>
                <X aria-hidden size={18} strokeWidth={1.25} />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.figure
                  key={index}
                  custom={direction}
                  className="absolute inset-0 flex touch-pan-y flex-col"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.25}
                  onDragEnd={onDragEnd}
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * 80, clipPath: d ? "inset(0% 0% 0% 0%)" : "inset(6% 6% 6% 6%)" }),
                    center: { opacity: 1, x: 0, clipPath: "inset(0% 0% 0% 0%)" },
                    exit: (d: number) => ({ opacity: 0, x: d * -80 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.8, ease: EASE }}
                >
                  <div className="frame relative min-h-0 flex-1">
                    <div className="relative h-full w-full">
                      <Media image={item.image} sizes="100vw" fit="contain" />
                    </div>
                  </div>
                  <figcaption className="frame py-5 text-center">
                    <span className="t-label text-silver">{item.caption}</span>
                  </figcaption>
                </motion.figure>
              </AnimatePresence>
            </div>

            <div className="frame flex h-20 shrink-0 items-center justify-between">
              <button
                type="button"
                onClick={() => go(-1)}
                className="flex h-11 items-center gap-3 px-2 text-silver hover:text-white"
              >
                <ArrowLeft aria-hidden size={18} strokeWidth={1.25} />
                <span className="t-label text-inherit">Previous</span>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="flex h-11 items-center gap-3 px-2 text-silver hover:text-white"
              >
                <span className="t-label text-inherit">Next</span>
                <ArrowRight aria-hidden size={18} strokeWidth={1.25} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
