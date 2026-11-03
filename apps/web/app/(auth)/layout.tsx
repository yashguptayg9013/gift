import { Logo } from '@/components/shell/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-subtle">
      <header className="px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-6 py-4 text-xs text-muted-foreground">PUJA OS · Manufacturing operating system</footer>
    </div>
  );
}
