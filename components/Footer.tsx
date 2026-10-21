import Link from "next/link";
import { store } from "@/lib/config";
import { occasions } from "@/lib/products";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink/10 bg-cream-100">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="font-display text-xl font-bold text-brand-700">🎁 {store.name}</p>
          <p className="mt-2 text-sm text-muted">{store.description}</p>
        </div>
        <div>
          <p className="font-semibold">Shop by occasion</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-muted">
            {occasions.map((o) => (
              <li key={o.id}>
                <Link href={`/?occasion=${o.id}#shop`} className="hover:text-brand-600">
                  {o.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm text-muted">
          <p className="font-semibold text-ink">Contact</p>
          <p className="mt-2">WhatsApp: +{store.whatsappNumber}</p>
          <p>Email: {store.email}</p>
          <p>Based in {store.city} · Pan-India shipping</p>
          <a href={store.instagram} className="mt-2 inline-block hover:text-brand-600">
            Instagram →
          </a>
        </div>
      </div>
      <p className="border-t border-ink/10 py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} {store.name}. All rights reserved.
      </p>
    </footer>
  );
}
