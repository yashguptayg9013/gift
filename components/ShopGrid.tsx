"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { occasions, products, type Occasion } from "@/lib/products";
import { ProductCard } from "./ProductCard";

type Sort = "popular" | "price-asc" | "price-desc";

export function ShopGrid() {
  const params = useSearchParams();
  const fromUrl = params.get("occasion") as Occasion | null;
  const [picked, setPicked] = useState<Occasion | "all" | null>(null);
  const [sort, setSort] = useState<Sort>("popular");
  const active = picked ?? (fromUrl && occasions.some((o) => o.id === fromUrl) ? fromUrl : "all");

  const shown = products
    .filter((p) => active === "all" || p.occasions.includes(active))
    .sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      return Number(!!b.bestseller) - Number(!!a.bestseller);
    });

  const chip = (id: Occasion | "all", label: string) => (
    <button
      key={id}
      onClick={() => setPicked(id)}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active === id ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10 hover:ring-ink/30"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {chip("all", "All gifts")}
          {occasions.map((o) => chip(o.id, `${o.emoji} ${o.label}`))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm"
          aria-label="Sort products"
        >
          <option value="popular">Most popular</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {shown.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-12 text-center text-muted">No hampers for this occasion yet — try building your own!</p>
      )}
    </div>
  );
}
