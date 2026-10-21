import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { store } from "@/lib/config";
import { formatPrice, whatsappLink } from "@/lib/order";
import { getProduct, occasions, products } from "@/lib/products";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: `${product.short} ${formatPrice(product.price)} – order on WhatsApp.`,
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const related = products
    .filter((p) => p.slug !== product.slug && p.occasions.some((o) => product.occasions.includes(o)))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/#shop" className="text-sm text-muted hover:text-brand-600">
        ← All hampers
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-12">
        <ProductImage product={product} size="large" />
        <div>
          <div className="flex flex-wrap gap-2">
            {product.occasions.map((id) => {
              const o = occasions.find((x) => x.id === id)!;
              return (
                <Link
                  key={id}
                  href={`/?occasion=${id}#shop`}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-ink/10"
                >
                  {o.emoji} {o.label}
                </Link>
              );
            })}
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold">{product.name}</h1>
          <p className="mt-3 text-lg text-muted">{product.short}</p>
          <p className="mt-5">
            <span className="text-3xl font-bold">{formatPrice(product.price)}</span>
            {product.mrp && product.mrp > product.price && (
              <span className="ml-3 text-lg text-muted line-through">{formatPrice(product.mrp)}</span>
            )}
            <span className="ml-2 text-sm text-muted">incl. of all taxes</span>
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <AddToCartButton product={product} />
            <AddToCartButton product={product} buyNow />
          </div>

          <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <p className="font-semibold">What&apos;s inside</p>
            <ul className="mt-3 space-y-2 text-muted">
              {product.contents.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="text-brand-600">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-6 grid gap-2 text-sm text-muted sm:grid-cols-2">
            <li>🚚 Same-day delivery in {store.city}</li>
            <li>📦 Pan-India shipping in 3–5 days</li>
            <li>📝 Free personalised message card</li>
            <li>
              🆓 Free shipping above {formatPrice(store.freeShippingAbove)}
            </li>
          </ul>

          <a
            href={whatsappLink(`Hi! I have a question about the ${product.name} (${formatPrice(product.price)}).`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Want to customise this hamper? Ask us on WhatsApp →
          </a>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold">You may also like</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
