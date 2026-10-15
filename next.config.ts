import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 80],
  },
  poweredByHeader: false,
};

export default nextConfig;
