import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-700">
          Loja Lever
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/">Vitrine</Link>
        </nav>
      </div>
    </header>
  );
}
