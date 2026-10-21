"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "./CartProvider";
import { store } from "@/lib/config";
import {
  formatPrice,
  newOrderId,
  orderMessage,
  orderTotals,
  upiLink,
  whatsappLink,
  type CustomerDetails,
} from "@/lib/order";

type PlacedOrder = { id: string; total: number; message: string };

const emptyCustomer: CustomerDetails = {
  name: "",
  phone: "",
  address: "",
  pincode: "",
  deliveryDate: "",
  giftMessage: "",
  express: false,
};

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function Checkout() {
  const { items, setQty, remove, clear } = useCart();
  const [customer, setCustomer] = useState(emptyCustomer);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [copied, setCopied] = useState(false);
  const totals = orderTotals(items, customer.express);

  const update = <K extends keyof CustomerDetails>(key: K, value: CustomerDetails[K]) =>
    setCustomer((c) => ({ ...c, [key]: value }));

  function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    const id = newOrderId();
    const message = orderMessage(id, items, customer);
    window.open(whatsappLink(message), "_blank", "noopener,noreferrer");
    setPlaced({ id, total: totals.total, message });
    clear();
  }

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(store.upiId);
      setCopied(true);
    } catch {}
  }

  if (placed) {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-3xl bg-white p-8 text-center ring-1 ring-ink/5">
        <div className="text-6xl">🎉</div>
        <h2 className="mt-4 font-display text-3xl font-bold">Order {placed.id} sent!</h2>
        <p className="mt-2 text-muted">
          We&apos;ve opened WhatsApp with your order details. Hit <b>send</b> there so we receive it.
        </p>
        <a
          href={whatsappLink(placed.message)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-whatsapp mt-4"
        >
          WhatsApp didn&apos;t open? Send order
        </a>

        <div className="mt-8 rounded-2xl bg-cream-100 p-6">
          <p className="font-semibold">Pay {formatPrice(placed.total)} by UPI</p>
          <p className="mt-1 text-sm text-muted">
            Your order is confirmed once payment is received. Share the payment screenshot on WhatsApp.
          </p>
          <a href={upiLink(placed.total, placed.id)} className="btn-primary mt-4 w-full">
            Pay with GPay / PhonePe / Paytm
          </a>
          <p className="mt-4 text-sm text-muted">On a computer? Pay to this UPI ID from your phone:</p>
          <button onClick={copyUpi} className="mt-1 font-mono text-lg font-semibold text-brand-700">
            {store.upiId} {copied ? "✓ copied" : "📋"}
          </button>
        </div>

        <Link href="/" className="mt-6 inline-block text-sm text-muted hover:text-brand-600">
          ← Continue shopping
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-10 rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
        <div className="text-6xl">🛒</div>
        <p className="mt-4 text-lg">Your cart is empty.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/#shop" className="btn-primary">
            Shop hampers
          </Link>
          <Link href="/build-hamper" className="btn-outline">
            Build your own
          </Link>
        </div>
      </div>
    );
  }

  const remainingForFree = store.freeShippingAbove - totals.subtotal;

  return (
    <form onSubmit={placeOrder} className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <section className="rounded-3xl bg-white p-4 ring-1 ring-ink/5 sm:p-6">
          <ul className="divide-y divide-ink/10">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-cream-100 text-3xl">
                  {i.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i.name}</p>
                  {i.note && <p className="truncate text-xs text-muted">{i.note}</p>}
                  <p className="text-sm text-muted">{formatPrice(i.price)}</p>
                </div>
                <div className="flex items-center rounded-full ring-1 ring-ink/15">
                  <button
                    type="button"
                    onClick={() => setQty(i.id, i.qty - 1)}
                    className="h-8 w-8"
                    aria-label={`Decrease ${i.name}`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{i.qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(i.id, i.qty + 1)}
                    className="h-8 w-8"
                    aria-label={`Increase ${i.name}`}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="text-sm text-muted hover:text-brand-600"
                  aria-label={`Remove ${i.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl bg-white p-4 ring-1 ring-ink/5 sm:p-6">
          <h2 className="text-lg font-semibold">Delivery details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Your name
              <input
                required
                className="input mt-1"
                value={customer.name}
                onChange={(e) => update("name", e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm font-medium">
              Phone number
              <input
                required
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                title="10-digit mobile number"
                placeholder="10-digit mobile"
                className="input mt-1"
                value={customer.phone}
                onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                autoComplete="tel-national"
              />
            </label>
            <label className="block text-sm font-medium sm:col-span-2">
              Delivery address
              <textarea
                required
                rows={3}
                placeholder="House no., street, area, city"
                className="input mt-1"
                value={customer.address}
                onChange={(e) => update("address", e.target.value)}
                autoComplete="street-address"
              />
            </label>
            <label className="block text-sm font-medium">
              Pincode
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                title="6-digit pincode"
                className="input mt-1"
                value={customer.pincode}
                onChange={(e) => update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="postal-code"
              />
            </label>
            <label className="block text-sm font-medium">
              Delivery date <span className="font-normal text-muted">(optional)</span>
              <input
                type="date"
                min={todayISO()}
                className="input mt-1"
                value={customer.deliveryDate}
                onChange={(e) => update("deliveryDate", e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium sm:col-span-2">
              Gift message <span className="font-normal text-muted">(we&apos;ll print it on a card)</span>
              <textarea
                rows={2}
                maxLength={200}
                placeholder="Happy birthday! Love, ..."
                className="input mt-1"
                value={customer.giftMessage}
                onChange={(e) => update("giftMessage", e.target.value)}
              />
            </label>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={customer.express}
                onChange={(e) => update("express", e.target.checked)}
              />
              Express / same-day delivery in {store.city} (+{formatPrice(store.expressFee)})
            </label>
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-3xl bg-white p-6 ring-1 ring-ink/5 lg:sticky lg:top-28">
        <p className="font-semibold">Order summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatPrice(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>{totals.shipping === 0 ? "FREE" : formatPrice(totals.shipping)}</dd>
          </div>
          {totals.expressFee > 0 && (
            <div className="flex justify-between">
              <dt>Express delivery</dt>
              <dd>{formatPrice(totals.expressFee)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink/10 pt-3 text-lg font-bold">
            <dt>Total</dt>
            <dd>{formatPrice(totals.total)}</dd>
          </div>
        </dl>
        {remainingForFree > 0 && (
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
            Add {formatPrice(remainingForFree)} more for free shipping!
          </p>
        )}
        <button type="submit" className="btn-whatsapp mt-5 w-full">
          Place order on WhatsApp
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          Next step: pay securely by UPI (GPay, PhonePe, Paytm).
        </p>
      </aside>
    </form>
  );
}
