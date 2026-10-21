# 🎁 GiftSetWala – online gift hamper store

A ready-to-launch online shop for selling gift hampers in India. Customers browse hampers or build their own, then place the order on **WhatsApp** and pay you directly by **UPI**. You don't need a payment gateway, a database or monthly fees, and you can host it free on Vercel.

## What's included

- **Storefront** with 10 sample hampers, occasion filters (Birthday, Diwali, Rakhi, Corporate…) and sorting
- **Product pages** showing what's inside, the discount and related products
- **Build-your-own-hamper** tool: the customer picks a box and items, and the price updates live
- **Cart & checkout**: delivery details, delivery date, gift message and an express-delivery add-on
- **WhatsApp ordering**: the full order (items, total, address, message) arrives on your WhatsApp
- **UPI payment**: a one-tap button that opens GPay, PhonePe or Paytm with the amount filled in
- **Corporate gifting page** with a bulk-quote form, since bulk orders are the most profitable gifting segment
- Free-shipping threshold, a floating WhatsApp chat button, SEO metadata, sitemap and mobile-friendly design

## 1. Make it yours (10 minutes)

| What | Where |
| --- | --- |
| Shop name, WhatsApp number, UPI ID, email, city, shipping fees | `lib/config.ts` |
| Products, prices, contents | `lib/products.ts` |
| Build-your-own items & prices | `hamperBoxes` / `hamperItems` in `lib/products.ts` |
| Customer reviews (only real ones; the section stays hidden while the list is empty) | `reviews` in `lib/config.ts` |
| Colours | `app/globals.css` |

**Product photos:** put images in `public/products/` (e.g. `choco-bliss.jpg`) and set `image: "/products/choco-bliss.jpg"` on the product. Products without a photo show an emoji tile. Real photos sell much better, so take them in daylight on a plain background.

> ⚠️ Before going live, replace the placeholder `whatsappNumber` (`919999999999`) and `upiId` (`yourname@upi`) with your own, or orders and payments will not reach you.

## 2. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## 3. Put it online for free

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to https://vercel.com/new, sign in with GitHub and import the repo, then click **Deploy**.
3. Set `url` in `lib/config.ts` to your Vercel URL (or your own domain, e.g. `giftsetwala.in`, which costs about ₹800/yr).

## 4. How you make money

**Order flow:** the customer orders on the site, you receive a WhatsApp message with the full order and they pay you by UPI. Then you pack and ship (Shiprocket / Delhivery for pan-India, Dunzo / Porter / self-delivery locally).

**Rough margins:** buy items wholesale (Sadar Bazaar, Crawford Market, IndiaMART, Meesho supplier) at about 40–50% of the selling price. A ₹1,499 hamper typically costs ₹600–750 in products + ₹80 packaging, which leaves **₹500–700 profit per order** before shipping.

**Getting your first customers:**
- **Instagram/WhatsApp status:** post every hamper you pack as a reel or story. Gifting is visual.
- **Festivals:** Diwali, Rakhi, Valentine's, Mother's Day, Christmas and New Year. Start promoting 3–4 weeks early.
- **Corporate:** message HR managers on LinkedIn before Diwali. One order of 50 boxes × ₹1,500 = ₹75,000 revenue.
- **Friends & family first:** ask the first 10 customers for a review and a photo, then add the reviews to `lib/config.ts`.
- **Google Business Profile:** free, and it shows you in "gift shop near me" searches.

**Other ways to earn with this code:** sell it as a ready-made website to other small gift, bakery or florist businesses (₹5,000–15,000 per setup). You only change `lib/config.ts` and `lib/products.ts` for each client.

## Upgrading later

When order volume grows, you can add a payment gateway (Razorpay / Cashfree) for automatic payment confirmation, plus a database for order tracking. The checkout code in `components/Checkout.tsx` and `lib/order.ts` is the place to plug these in.

## Tech

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · TypeScript. The cart is kept in the browser (`localStorage`) and every page is static, so hosting is free.
