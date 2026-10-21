import type { Metadata } from "next";
import { CorporateForm } from "@/components/CorporateForm";
import { ProductCard } from "@/components/ProductCard";
import { products } from "@/lib/products";

export const metadata: Metadata = {
  title: "Corporate Gifting",
  description:
    "Bulk gift hampers for employees and clients – Diwali gifts, welcome kits and festive boxes with logo branding and pan-India delivery.",
};

const perks = [
  { emoji: "🏷️", title: "Bulk pricing", text: "Tiered discounts from 25 boxes upwards." },
  { emoji: "🎨", title: "Your branding", text: "Logo on boxes, cards, mugs and bottles." },
  { emoji: "📍", title: "Multi-address delivery", text: "Send us a sheet — we ship to every employee." },
  { emoji: "🧾", title: "GST invoice", text: "Proper tax invoice for your accounts team." },
];

export default function CorporatePage() {
  const corporate = products.filter((p) => p.occasions.includes("corporate"));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
            For HR, founders & teams
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Corporate gifting, made effortless.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Diwali boxes, onboarding kits and client thank-yous — curated, branded and delivered across India.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {perks.map((p) => (
              <div key={p.title} className="rounded-3xl bg-white p-5 ring-1 ring-ink/5">
                <div className="text-3xl">{p.emoji}</div>
                <p className="mt-2 font-semibold">{p.title}</p>
                <p className="text-sm text-muted">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
        <CorporateForm />
      </div>

      <section className="mt-16">
        <h2 className="font-display text-2xl font-bold">Popular with companies</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {corporate.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
