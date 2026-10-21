"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";
import { store } from "@/lib/config";
import { formatPrice } from "@/lib/order";

export function Header() {
  const { count } = useCart();
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream-50/90 backdrop-blur">
      <div className="bg-brand-600 px-4 py-1.5 text-center text-xs font-medium text-white sm:text-sm">
        Free delivery on orders above {formatPrice(store.freeShippingAbove)} · Same-day delivery in {store.city}
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="whitespace-nowrap font-display text-xl font-bold tracking-tight text-brand-700 sm:text-2xl">
          🎁 {store.name}
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-4">
          <Link href="/#shop" className="hidden rounded-full px-3 py-2 hover:bg-cream-100 sm:block">
            Shop
          </Link>
          <Link href="/build-hamper" className="whitespace-nowrap rounded-full px-3 py-2 hover:bg-cream-100">
            Build a Hamper
          </Link>
          <Link href="/corporate" className="hidden rounded-full px-3 py-2 hover:bg-cream-100 sm:block">
            Corporate
          </Link>
          <Link
            href="/cart"
            className="relative rounded-full bg-ink px-4 py-2 text-white hover:bg-ink/85"
            aria-label={`Cart, ${count} items`}
          >
            🛒 <span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-bold">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
