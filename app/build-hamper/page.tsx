import type { Metadata } from "next";
import { HamperBuilder } from "@/components/HamperBuilder";

export const metadata: Metadata = {
  title: "Build Your Own Hamper",
  description: "Pick a box, add their favourite treats and we'll pack a custom gift hamper.",
};

export default function BuildHamperPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-4xl font-bold">Build your own hamper</h1>
      <p className="mt-2 max-w-xl text-muted">
        Choose a box, add as many goodies as you like, and we&apos;ll gift-wrap it with a personal note.
      </p>
      <HamperBuilder />
    </div>
  );
}
