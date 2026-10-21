export type Occasion =
  | "birthday"
  | "anniversary"
  | "diwali"
  | "rakhi"
  | "corporate"
  | "for-her"
  | "for-him"
  | "baby";

export type Product = {
  slug: string;
  name: string;
  price: number;
  // Original price, shown struck through when higher than price.
  mrp?: number;
  occasions: Occasion[];
  short: string;
  contents: string[];
  // Put a photo in /public/products and set e.g. "/products/choco-bliss.jpg".
  // Without one, a coloured tile with the emoji is shown.
  image?: string;
  emoji: string;
  color: string;
  bestseller?: boolean;
  inStock?: boolean;
};

export const occasions: { id: Occasion; label: string; emoji: string }[] = [
  { id: "birthday", label: "Birthday", emoji: "🎂" },
  { id: "anniversary", label: "Anniversary", emoji: "💞" },
  { id: "diwali", label: "Diwali", emoji: "🪔" },
  { id: "rakhi", label: "Rakhi", emoji: "🧵" },
  { id: "corporate", label: "Corporate", emoji: "💼" },
  { id: "for-her", label: "For Her", emoji: "🌸" },
  { id: "for-him", label: "For Him", emoji: "🧔" },
  { id: "baby", label: "New Baby", emoji: "🍼" },
];

export const products: Product[] = [
  {
    slug: "choco-bliss-hamper",
    name: "Choco Bliss Hamper",
    price: 899,
    mrp: 1199,
    occasions: ["birthday", "anniversary", "for-her"],
    short: "A chocolate lover's dream in a reusable keepsake box.",
    contents: [
      "Assorted handmade chocolates (12 pc)",
      "Belgian chocolate bar",
      "Choco-chip cookies jar",
      "Personalised greeting card",
      "Reusable kraft gift box",
    ],
    emoji: "🍫",
    color: "#7c4a2d",
    bestseller: true,
  },
  {
    slug: "diwali-dhamaka-box",
    name: "Diwali Dhamaka Box",
    price: 1499,
    mrp: 1899,
    occasions: ["diwali", "corporate"],
    short: "Dry fruits, diyas and sweets for a sparkling Diwali.",
    contents: [
      "Premium dry fruits (almonds, cashews, raisins – 300 g)",
      "2 hand-painted clay diyas",
      "Kaju katli (250 g)",
      "Scented candle",
      "Festive wooden tray",
    ],
    emoji: "🪔",
    color: "#c2410c",
    bestseller: true,
  },
  {
    slug: "spa-day-for-her",
    name: "Spa Day For Her",
    price: 1299,
    mrp: 1599,
    occasions: ["for-her", "birthday", "anniversary"],
    short: "Self-care essentials to help her relax and unwind.",
    contents: [
      "Bath salts with rose petals",
      "Handmade soap trio",
      "Aroma candle",
      "Face mask sheets (2)",
      "Satin scrunchie",
    ],
    emoji: "🌸",
    color: "#db2777",
  },
  {
    slug: "gentlemans-kit",
    name: "The Gentleman's Kit",
    price: 1599,
    mrp: 1999,
    occasions: ["for-him", "birthday", "anniversary"],
    short: "A classy grooming and desk set for the modern man.",
    contents: [
      "Beard oil & comb",
      "Leather card wallet",
      "Premium metal pen",
      "Coffee sachets",
      "Black gift box with ribbon",
    ],
    emoji: "🎩",
    color: "#1f2937",
  },
  {
    slug: "rakhi-sweet-surprise",
    name: "Rakhi Sweet Surprise",
    price: 699,
    mrp: 899,
    occasions: ["rakhi"],
    short: "Designer rakhi with sweets, roli-chawal and a card.",
    contents: [
      "Designer rakhi",
      "Roli & chawal",
      "Assorted sweets (250 g)",
      "Mini chocolates",
      "Greeting card",
    ],
    emoji: "🧵",
    color: "#b91c1c",
  },
  {
    slug: "corporate-welcome-kit",
    name: "Corporate Welcome Kit",
    price: 1999,
    occasions: ["corporate"],
    short: "Onboarding kit that new hires actually love. Logo branding available.",
    contents: [
      "Insulated steel bottle",
      "Hardbound diary & pen",
      "Desk plant",
      "Snack pack",
      "Branded box (on bulk orders)",
    ],
    emoji: "💼",
    color: "#1d4ed8",
    bestseller: true,
  },
  {
    slug: "love-in-a-box",
    name: "Love In A Box",
    price: 1099,
    mrp: 1399,
    occasions: ["anniversary", "for-her", "for-him"],
    short: "Romantic hamper with roses, chocolates and a photo frame.",
    contents: [
      "Preserved red roses",
      "Heart-shaped chocolates",
      "Mini photo frame",
      "Love-notes jar",
      "Red velvet gift box",
    ],
    emoji: "💝",
    color: "#be123c",
  },
  {
    slug: "little-one-welcome",
    name: "Little One Welcome Hamper",
    price: 1399,
    occasions: ["baby"],
    short: "Soft, safe and adorable gifts for a newborn.",
    contents: [
      "Organic cotton romper",
      "Soft plush toy",
      "Baby blanket",
      "Gentle baby wash",
      "Keepsake box",
    ],
    emoji: "🍼",
    color: "#0891b2",
  },
  {
    slug: "chai-time-hamper",
    name: "Chai Time Hamper",
    price: 799,
    occasions: ["birthday", "corporate", "diwali", "for-him"],
    short: "Masala chai, cookies and a kulhad set for chai lovers.",
    contents: [
      "Masala chai (100 g)",
      "2 kulhad cups",
      "Butter cookies",
      "Rusk pack",
      "Jute gift bag",
    ],
    emoji: "☕",
    color: "#92400e",
  },
  {
    slug: "dry-fruit-royale",
    name: "Dry Fruit Royale",
    price: 2499,
    mrp: 2999,
    occasions: ["diwali", "corporate", "anniversary"],
    short: "Premium dry fruits in an elegant wooden box with brass accents.",
    contents: [
      "Almonds (200 g)",
      "Cashews (200 g)",
      "Pistachios (150 g)",
      "Dates (200 g)",
      "Wooden box with brass handles",
    ],
    emoji: "🌰",
    color: "#a16207",
  },
];

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}

// Pieces for the "Build your own hamper" page.
export type HamperOption = { id: string; name: string; price: number; emoji: string };

export const hamperBoxes: HamperOption[] = [
  { id: "kraft", name: "Kraft box", price: 149, emoji: "📦" },
  { id: "basket", name: "Wicker basket", price: 299, emoji: "🧺" },
  { id: "wooden", name: "Wooden crate", price: 449, emoji: "🪵" },
];

export const hamperItems: HamperOption[] = [
  { id: "chocolates", name: "Handmade chocolates", price: 249, emoji: "🍫" },
  { id: "cookies", name: "Cookie jar", price: 199, emoji: "🍪" },
  { id: "dryfruits", name: "Dry fruits (200 g)", price: 349, emoji: "🌰" },
  { id: "candle", name: "Scented candle", price: 229, emoji: "🕯️" },
  { id: "mug", name: "Personalised mug", price: 299, emoji: "☕" },
  { id: "plant", name: "Mini succulent", price: 199, emoji: "🪴" },
  { id: "flowers", name: "Preserved roses", price: 399, emoji: "🌹" },
  { id: "teddy", name: "Teddy bear", price: 349, emoji: "🧸" },
  { id: "tea", name: "Masala chai tin", price: 179, emoji: "🍵" },
  { id: "frame", name: "Photo frame", price: 249, emoji: "🖼️" },
  { id: "soap", name: "Handmade soaps", price: 199, emoji: "🧼" },
  { id: "diary", name: "Diary & pen", price: 279, emoji: "📓" },
];
