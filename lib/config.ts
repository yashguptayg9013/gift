// Edit this file to make the store yours. Every page reads from here.
export const store = {
  name: "GiftSetWala",
  tagline: "Handpicked gift hampers, delivered with love",
  description:
    "Curated gift hampers and gift sets for birthdays, anniversaries, Diwali, Rakhi and corporate gifting. Order on WhatsApp, pay by UPI.",
  // Full URL where the site is deployed (used for SEO / sitemap).
  url: "https://giftsetwala.vercel.app",

  // Orders are sent here as a pre-filled WhatsApp message.
  // Country code + number, digits only (e.g. 91 + 10-digit mobile).
  whatsappNumber: "919999999999",

  // Customers can pay you directly by UPI. Use your own UPI ID.
  upiId: "yourname@upi",
  upiPayeeName: "GiftSetWala",

  email: "orders@giftsetwala.in",
  city: "Delhi NCR",

  currency: "INR",
  freeShippingAbove: 1499,
  shippingFee: 99,
  // Optional express delivery for local orders.
  expressFee: 149,

  instagram: "https://instagram.com/giftsetwala",
} as const;

// Real customer reviews, shown on the home page. The section stays hidden
// while this list is empty — only add reviews you actually received, e.g.
// { name: "Priya S.", text: "The hamper was gorgeous!", rating: 5 },
export const reviews: { name: string; text: string; rating: number }[] = [];
