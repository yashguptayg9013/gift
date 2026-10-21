import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <div className="text-6xl">🎁</div>
      <h1 className="mt-4 font-display text-3xl font-bold">This gift got lost in the mail</h1>
      <p className="mt-2 text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-6">
        Back to the shop
      </Link>
    </div>
  );
}
