"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/order";
import { hamperBoxes, hamperItems } from "@/lib/products";

const MIN_ITEMS = 2;

export function HamperBuilder() {
  const { add } = useCart();
  const router = useRouter();
  const [boxId, setBoxId] = useState(hamperBoxes[0].id);
  const [picked, setPicked] = useState<string[]>([]);

  const box = hamperBoxes.find((b) => b.id === boxId)!;
  const items = hamperItems.filter((i) => picked.includes(i.id));
  const total = box.price + items.reduce((s, i) => s + i.price, 0);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addToCart() {
    const ids = [box.id, ...[...picked].sort()].join("+");
    add({
      id: `custom:${ids}`,
      name: `Custom Hamper (${box.name})`,
      price: total,
      emoji: "🎁",
      note: items.map((i) => i.name).join(", "),
    });
    router.push("/cart");
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-10">
        <section>
          <h2 className="text-lg font-semibold">1. Choose your box</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {hamperBoxes.map((b) => (
              <button
                key={b.id}
                onClick={() => setBoxId(b.id)}
                className={`rounded-2xl bg-white p-4 text-center ring-2 transition ${
                  boxId === b.id ? "ring-brand-500" : "ring-transparent hover:ring-ink/10"
                }`}
              >
                <div className="text-4xl">{b.emoji}</div>
                <p className="mt-2 text-sm font-semibold">{b.name}</p>
                <p className="text-sm text-muted">{formatPrice(b.price)}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">
            2. Fill it up <span className="font-normal text-muted">(pick at least {MIN_ITEMS})</span>
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {hamperItems.map((i) => {
              const on = picked.includes(i.id);
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  aria-pressed={on}
                  className={`relative rounded-2xl bg-white p-4 text-center ring-2 transition ${
                    on ? "ring-brand-500" : "ring-transparent hover:ring-ink/10"
                  }`}
                >
                  {on && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                      ✓
                    </span>
                  )}
                  <div className="text-4xl">{i.emoji}</div>
                  <p className="mt-2 text-sm font-semibold">{i.name}</p>
                  <p className="text-sm text-muted">{formatPrice(i.price)}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-3xl bg-white p-6 ring-1 ring-ink/5 lg:sticky lg:top-28">
        <p className="font-semibold">Your hamper</p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex justify-between">
            <span>
              {box.emoji} {box.name}
            </span>
            <span>{formatPrice(box.price)}</span>
          </li>
          {items.map((i) => (
            <li key={i.id} className="flex justify-between">
              <span>
                {i.emoji} {i.name}
              </span>
              <span>{formatPrice(i.price)}</span>
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="mt-2 text-sm text-muted">Tap items on the left to add them.</p>}
        <div className="mt-4 flex justify-between border-t border-ink/10 pt-4 text-lg font-bold">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
        <button onClick={addToCart} disabled={items.length < MIN_ITEMS} className="btn-primary mt-4 w-full">
          {items.length < MIN_ITEMS ? `Add ${MIN_ITEMS - items.length} more item${MIN_ITEMS - items.length > 1 ? "s" : ""}` : "Add hamper to cart"}
        </button>
        <p className="mt-3 text-center text-xs text-muted">Gift wrap & message card included free</p>
      </aside>
    </div>
  );
}
