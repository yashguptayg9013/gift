import Link from "next/link";
import type { Product } from "@/lib/products";
import { formatPrice } from "@/lib/order";
import { ProductImage } from "./ProductImage";
import { AddToCartButton } from "./AddToCartButton";

export function ProductCard({ product }: { product: Product }) {
  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : 0;
  return (
    <div className="group flex flex-col rounded-3xl bg-white p-3 shadow-sm ring-1 ring-ink/5 transition-shadow hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="relative block">
        <ProductImage product={product} />
        {product.bestseller && (
          <span className="absolute bottom-3 left-3 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-white">
            Bestseller
          </span>
        )}
        {discount > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-600">
            {discount}% off
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <Link href={`/products/${product.slug}`} className="font-semibold leading-snug group-hover:text-brand-600">
          {product.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{product.short}</p>
        <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="text-lg font-bold">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <span className="ml-1.5 text-sm text-muted line-through">{formatPrice(product.mrp!)}</span>
            )}
          </p>
          <AddToCartButton product={product} compact />
        </div>
      </div>
    </div>
  );
}
