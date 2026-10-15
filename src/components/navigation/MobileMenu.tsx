"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type MouseEvent } from "react";
import { site } from "@/data/site";
import { vehicle } from "@/data/vehicle";
import { cn } from "@/lib/cn";
import { lockScroll } from "@/lib/scroll";
import { Wordmark } from "./Wordmark";

const EASE = [0.16, 1, 0.3, 1] as const;

type Props = {
  onClose: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  active: string | null;
};

/** Full-screen menu for small screens. Escape closes; focus is contained. */
export function MobileMenu({ onClose, onNavigate, active }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const items = [...site.nav, ...site.navExtra];

  useEffect(() => {
    lockScroll(true);
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>("a, button");
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
  }, [onClose]);

  return (
    <motion.div
      ref={panel}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      className="fixed inset-0 z-[65] flex flex-col bg-obsidian md:hidden"
      initial={{ clipPath: "inset(0% 0% 100% 0%)" }}
      animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
      exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <div className="frame flex h-[var(--nav-h)] items-center justify-between">
        <Wordmark />
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 flex h-11 w-11 items-center justify-center text-silver"
        >
          <X aria-hidden size={20} strokeWidth={1.25} />
          <span className="sr-only">Close menu</span>
        </button>
      </div>

      <nav aria-label="Mobile" className="frame flex flex-1 flex-col justify-center">
        <ol className="space-y-1">
          {items.map((item, index) => (
            <motion.li
              key={item.href}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.2 + index * 0.06 }}
              className="border-b border-line"
            >
              <a
                href={item.href}
                onClick={(e) => {
                  // Release the scroll lock now — the menu's exit animation
                  // would otherwise hold it while the page tries to scroll.
                  lockScroll(false);
                  onNavigate(e, item.href);
                }}
                aria-current={active === item.href.slice(1) ? "true" : undefined}
                className={cn(
                  "flex items-baseline justify-between py-4 font-display text-[2.75rem] font-semibold uppercase leading-none",
                  active === item.href.slice(1) ? "text-white" : "text-silver/75",
                )}
              >
                {item.label}
                <span className="font-mono text-[0.625rem] tracking-[0.24em] text-steel">0{index + 1}</span>
              </a>
            </motion.li>
          ))}
        </ol>
      </nav>

      <div className="frame flex flex-col gap-2 pb-8 pt-6">
        <span className="t-label normal-case">{vehicle.label}</span>
        <span className="t-label">{site.copy.hero.tagline}</span>
      </div>
    </motion.div>
  );
}
