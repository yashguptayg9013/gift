"use client";

import { Menu } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { site } from "@/data/site";
import { cn } from "@/lib/cn";
import { scrollToTarget } from "@/lib/scroll";
import { MobileMenu } from "./MobileMenu";
import { Wordmark } from "./Wordmark";

// "top" (the opening) clears the highlight when you scroll back up.
const SECTION_IDS = ["top", ...[...site.nav, ...site.navExtra].map((item) => item.href.slice(1))];

/**
 * Minimal fixed navigation. Transparent over the opening, a thin
 * graphite bar once scrolling starts, tucked away while reading
 * downward and back the moment you scroll up.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Scroll state: rAF-throttled, and React only re-renders when a
  // boolean actually flips.
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 40);
      if (Math.abs(y - lastY) > 6) {
        setTucked(y > lastY && y > window.innerHeight * 0.9);
        lastY = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Highlight the section currently in the middle of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const navigate = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    setOpen(false);
    scrollToTarget(href, { focus: true });
    history.replaceState(null, "", href === "#top" ? location.pathname : href);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    menuButton.current?.focus();
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b transition-[transform,background-color,border-color] duration-700 ease-[var(--ease-reveal)]",
          scrolled ? "border-line bg-obsidian/75 backdrop-blur-md" : "border-transparent bg-transparent",
          tucked && !open && "-translate-y-full",
        )}
      >
        <nav aria-label="Primary" className="frame flex h-[var(--nav-h)] items-center justify-between">
          <a href="#top" onClick={(e) => navigate(e, "#top")} aria-label={`${site.projectName} — back to the opening`}>
            <Wordmark />
          </a>

          <ul className="hidden items-center gap-10 md:flex lg:gap-14">
            {site.nav.map((item) => {
              const current = active === item.href.slice(1);
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={(e) => navigate(e, item.href)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "link-line font-mono text-[0.6875rem] uppercase tracking-[0.24em] transition-colors duration-300",
                      current ? "text-white" : "text-silver/70 hover:text-white",
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>

          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="-mr-2 flex h-11 w-11 items-center justify-center text-silver md:hidden"
          >
            <Menu aria-hidden size={20} strokeWidth={1.25} />
            <span className="sr-only">Open menu</span>
          </button>
        </nav>
      </header>

      <AnimatePresence>{open && <MobileMenu onClose={closeMenu} onNavigate={navigate} active={active} />}</AnimatePresence>
    </>
  );
}
