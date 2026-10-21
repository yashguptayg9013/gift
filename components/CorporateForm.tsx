"use client";

import { useState } from "react";
import { store } from "@/lib/config";
import { formatPrice, whatsappLink } from "@/lib/order";

const budgets = [500, 1000, 1500, 2500, 5000];

export function CorporateForm() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    quantity: "50",
    budget: "1000",
    deadline: "",
    notes: "",
  });
  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = [
      `💼 *Corporate gifting enquiry* – ${store.name}`,
      "",
      `Name: ${form.name}`,
      `Company: ${form.company}`,
      `Phone: ${form.phone}`,
      `Quantity: ${form.quantity} boxes`,
      `Budget per box: ${formatPrice(Number(form.budget))}`,
      `Needed by: ${form.deadline || "Flexible"}`,
      ...(form.notes ? [`Notes: ${form.notes}`] : []),
    ].join("\n");
    window.open(whatsappLink(text), "_blank", "noopener,noreferrer");
  }

  return (
    <form onSubmit={submit} className="h-fit space-y-4 rounded-3xl bg-white p-6 ring-1 ring-ink/5">
      <p className="text-lg font-semibold">Get a quote in 2 hours</p>
      <input required placeholder="Your name" className="input" value={form.name} onChange={update("name")} />
      <input required placeholder="Company" className="input" value={form.company} onChange={update("company")} />
      <input
        required
        type="tel"
        placeholder="Phone number"
        className="input"
        value={form.phone}
        onChange={update("phone")}
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Quantity
          <input
            required
            type="number"
            min={10}
            className="input mt-1"
            value={form.quantity}
            onChange={update("quantity")}
          />
        </label>
        <label className="text-sm font-medium">
          Budget / box
          <select className="input mt-1" value={form.budget} onChange={update("budget")}>
            {budgets.map((b) => (
              <option key={b} value={b}>
                {formatPrice(b)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Needed by
        <input type="date" className="input mt-1" value={form.deadline} onChange={update("deadline")} />
      </label>
      <textarea
        rows={3}
        placeholder="Occasion, branding needs, anything else…"
        className="input"
        value={form.notes}
        onChange={update("notes")}
      />
      <button type="submit" className="btn-whatsapp w-full">
        Send enquiry on WhatsApp
      </button>
      <p className="text-center text-xs text-muted">Or email us at {store.email}</p>
    </form>
  );
}
