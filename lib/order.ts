import { store } from "./config";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  emoji: string;
  // Extra details, e.g. the pieces chosen for a custom hamper.
  note?: string;
};

export type CustomerDetails = {
  name: string;
  phone: string;
  address: string;
  pincode: string;
  deliveryDate: string;
  giftMessage: string;
  express: boolean;
};

export function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: store.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function orderTotals(items: CartItem[], express: boolean) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping =
    subtotal === 0 || subtotal >= store.freeShippingAbove ? 0 : store.shippingFee;
  const expressFee = express && subtotal > 0 ? store.expressFee : 0;
  return { subtotal, shipping, expressFee, total: subtotal + shipping + expressFee };
}

export function whatsappLink(text: string) {
  return `https://wa.me/${store.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

export function upiLink(amount: number, orderId: string) {
  const params = new URLSearchParams({
    pa: store.upiId,
    pn: store.upiPayeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: `Order ${orderId}`,
  });
  return `upi://pay?${params.toString()}`;
}

export function newOrderId() {
  const d = new Date();
  const date = `${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `GSW-${date}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function orderMessage(
  orderId: string,
  items: CartItem[],
  customer: CustomerDetails,
) {
  const t = orderTotals(items, customer.express);
  const lines = [
    `🎁 *New order ${orderId}* – ${store.name}`,
    "",
    ...items.map(
      (i) =>
        `• ${i.name} × ${i.qty} = ${formatPrice(i.price * i.qty)}${i.note ? `\n   (${i.note})` : ""}`,
    ),
    "",
    `Subtotal: ${formatPrice(t.subtotal)}`,
    `Shipping: ${t.shipping === 0 ? "FREE" : formatPrice(t.shipping)}`,
    ...(t.expressFee ? [`Express delivery: ${formatPrice(t.expressFee)}`] : []),
    `*Total: ${formatPrice(t.total)}*`,
    "",
    `Name: ${customer.name}`,
    `Phone: ${customer.phone}`,
    `Address: ${customer.address}, ${customer.pincode}`,
    `Delivery date: ${customer.deliveryDate || "As soon as possible"}`,
    ...(customer.giftMessage ? [`Gift message: "${customer.giftMessage}"`] : []),
  ];
  return lines.join("\n");
}
