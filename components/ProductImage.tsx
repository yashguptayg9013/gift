import Image from "next/image";
import type { Product } from "@/lib/products";

export function ProductImage({
  product,
  size = "card",
}: {
  product: Pick<Product, "name" | "image" | "emoji" | "color">;
  size?: "card" | "large";
}) {
  if (product.image) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-cream-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes={size === "large" ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={product.name}
      className="flex aspect-square w-full items-center justify-center rounded-2xl"
      style={{
        background: `radial-gradient(circle at 30% 25%, ${product.color}33, ${product.color}14 55%, ${product.color}26)`,
      }}
    >
      <span className={size === "large" ? "text-[9rem]" : "text-7xl"} aria-hidden>
        {product.emoji}
      </span>
    </div>
  );
}
