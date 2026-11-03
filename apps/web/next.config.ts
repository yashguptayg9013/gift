import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pnpm monorepo: resolve workspace packages from the repository root
  turbopack: { root: path.join(__dirname, '../..') },
  poweredByHeader: false,
  transpilePackages: ['@puja/shared'],
  // The browser only ever talks to this origin; Next proxies /api/* to the NestJS API
  // so authentication cookies stay first-party (SameSite=Strict, httpOnly).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
