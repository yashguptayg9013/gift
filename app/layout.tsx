import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Decision Engine",
  description: "A private decision engine and journal: weigh cost, value, alternatives and your priorities, then learn from how things turned out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-4xl px-4 pb-8 text-xs text-muted sm:px-6">
          Private by design — your decisions are stored only in this browser.
        </footer>
      </body>
    </html>
  );
}
