"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";
import type { Product } from "@/lib/products";

export function AddToCartButton({
  product,
  compact = false,
  buyNow = false,
}: {
  product: Product;
  compact?: boolean;
  buyNow?: boolean;
}) {
  const { add } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);
  const soldOut = product.inStock === false;

  function handleClick() {
    add({ id: product.slug, name: product.name, price: product.price, emoji: product.emoji });
    if (buyNow) {
      router.push("/cart");
      return;
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={soldOut}
        className="w-full rounded-full bg-brand-600 px-4 py-2 text-sm sm:w-auto font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {soldOut ? "Sold out" : added ? "Added ✓" : "Add"}
      </button>
    );
  }

  return (
    <button onClick={handleClick} disabled={soldOut} className={buyNow ? "btn-outline" : "btn-primary"}>
      {soldOut ? "Sold out" : buyNow ? "Buy now" : added ? "Added to cart ✓" : "Add to cart"}
    </button>
  );
}
