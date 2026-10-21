import Link from "next/link";
import { Suspense } from "react";
import { ShopGrid } from "@/components/ShopGrid";
import { reviews, store } from "@/lib/config";
import { formatPrice } from "@/lib/order";
import { products } from "@/lib/products";

const steps = [
  { emoji: "🛍️", title: "Pick a hamper", text: "Choose a ready gift set or build your own in a minute." },
  { emoji: "💬", title: "Order on WhatsApp", text: "Your order details are sent to us instantly — no sign-up needed." },
  { emoji: "📲", title: "Pay by UPI", text: "Pay securely with GPay, PhonePe, Paytm or any UPI app." },
  { emoji: "🚚", title: "We deliver", text: `Same-day in ${store.city}, 3–5 days anywhere in India.` },
];


export default function Home() {
  const minPrice = Math.min(...products.map((p) => p.price));
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
              Gift hampers from {formatPrice(minPrice)}
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              Gifts that make them <span className="text-brand-600">smile</span>.
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">{store.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#shop" className="btn-primary">
                Shop hampers
              </Link>
              <Link href="/build-hamper" className="btn-outline">
                Build your own →
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted">✨ Handpicked & gift-wrapped · 📝 Free personal note · 📲 Pay by UPI</p>
          </div>
          <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4">
            {["🎁", "🍫", "🪔", "🌹"].map((e, i) => (
              <div
                key={e}
                className={`flex aspect-square items-center justify-center rounded-3xl text-7xl shadow-sm ${
                  ["bg-brand-100", "bg-cream-200", "bg-amber-100", "bg-rose-100"][i]
                } ${i % 2 ? "translate-y-6" : ""}`}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="shop" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-10">
        <h2 className="font-display text-3xl font-bold">Shop gift hampers</h2>
        <p className="mt-1 text-muted">Handpicked, beautifully packed, ready to gift.</p>
        <div className="mt-6">
          <Suspense>
            <ShopGrid />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid items-center gap-8 rounded-3xl bg-ink p-8 text-white md:grid-cols-[1fr_auto] md:p-12">
          <div>
            <h2 className="font-display text-3xl font-bold">Can&apos;t decide? Build your own hamper.</h2>
            <p className="mt-2 max-w-xl text-white/75">
              Pick a box, add their favourite treats, write a personal note. We&apos;ll pack it beautifully.
            </p>
          </div>
          <Link href="/build-hamper" className="btn bg-white text-ink hover:bg-cream-100">
            Start building 🎁
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-center font-display text-3xl font-bold">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
              <div className="text-4xl">{s.emoji}</div>
              <p className="mt-3 font-semibold">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {reviews.length > 0 && (
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-center font-display text-3xl font-bold">Loved by gifters</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.name} className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
              <p className="text-gold">{"★".repeat(r.rating)}</p>
              <blockquote className="mt-2 text-muted">&ldquo;{r.text}&rdquo;</blockquote>
              <figcaption className="mt-3 font-semibold">{r.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-brand-50 p-8 text-center ring-1 ring-brand-100 md:p-12">
          <h2 className="font-display text-3xl font-bold">Gifting for your team or clients?</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted">
            Bulk discounts from 25 boxes, logo branding and pan-India delivery to every address.
          </p>
          <Link href="/corporate" className="btn-primary mt-6">
            Get a corporate quote
          </Link>
        </div>
      </section>
    </>
  );
}
