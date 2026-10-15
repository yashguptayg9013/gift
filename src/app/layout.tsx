import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { SvgDefs } from "@/components/ui/placeholder-art";
import { Cursor } from "@/components/motion/Cursor";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { SiteNav } from "@/components/navigation/SiteNav";
import { site } from "@/data/site";
import "./globals.css";

/*
 * Typography: Geist (text), Geist Mono (technical labels) and
 * Barlow Condensed (display headlines). To change the display face,
 * swap the import below and keep `variable: "--font-condensed"`.
 */
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const condensed = Barlow_Condensed({
  variable: "--font-condensed",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  openGraph: {
    title: site.title,
    description: site.description,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

/**
 * Runs before paint: marks JS as available (so the opening can start
 * from black) and, as a safety net, reveals everything if the motion
 * layer has not initialised within 4 seconds.
 */
const bootScript = `(function(){var d=document.documentElement;d.classList.add('js');setTimeout(function(){if(!d.classList.contains('intro-ready'))d.classList.add('intro-fallback')},4000)})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${condensed.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only z-[100] bg-silver px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-obsidian focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <SvgDefs />
        <SmoothScroll />
        <SiteNav />
        <main id="main">{children}</main>
        <ScrollProgress />
        <Cursor />
        <div data-curtain aria-hidden className="pointer-events-none invisible fixed inset-0 z-[95] bg-obsidian opacity-0" />
        <div aria-hidden className="grain" />
      </body>
    </html>
  );
}
