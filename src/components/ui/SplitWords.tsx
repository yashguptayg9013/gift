import { Fragment } from "react";
import { cn } from "@/lib/cn";

/**
 * Renders text as masked words for GSAP reveals. Words stay readable
 * in the server HTML and to screen readers; `\n` forces a line break.
 */
export function SplitWords({ text, wordClassName }: { text: string; wordClassName?: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const words = line.split(" ");
        return (
          <Fragment key={li}>
            <span className="block">
              {words.map((word, wi) => (
                <Fragment key={wi}>
                  <span className="word-mask">
                    <span data-word className={cn(wordClassName)}>
                      {word}
                    </span>
                  </span>
                  {wi < words.length - 1 ? " " : null}
                </Fragment>
              ))}
            </span>
            {li < lines.length - 1 ? " " : null}
          </Fragment>
        );
      })}
    </>
  );
}
