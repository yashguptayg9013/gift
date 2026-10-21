import type { MetadataRoute } from "next";
import { store } from "@/lib/config";
import { products } from "@/lib/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/build-hamper", "/corporate"].map((path) => ({ url: `${store.url}${path}` }));
  return [...pages, ...products.map((p) => ({ url: `${store.url}/products/${p.slug}` }))];
}
