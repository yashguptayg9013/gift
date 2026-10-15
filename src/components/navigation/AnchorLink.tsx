"use client";

import type { AnchorHTMLAttributes } from "react";
import { scrollToTarget } from "@/lib/scroll";

/** An in-page link that scrolls smoothly and moves focus to its target. */
export function AnchorLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: `#${string}` }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        scrollToTarget(href, { focus: true });
      }}
      {...props}
    />
  );
}
