import Link from 'next/link';

import { CATEGORIES, CATEGORY_LABELS, type Category, type Product } from '@/catalog/schema';
import { cn } from '@/lib/utils';

import { ProductCard } from './product-card';

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full border px-3 py-1 text-sm',
        active
          ? 'border-emerald-700 bg-emerald-700 text-white'
          : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
      )}
    >
      {label}
    </Link>
  );
}

export function ProductGrid({
  products,
  category,
}: {
  products: readonly Product[];
  category: Category | undefined;
}) {
  return (
    <section id="produtos" className="flex flex-col gap-4">
      <nav aria-label="Categorias" className="flex flex-wrap gap-2">
        <FilterLink href="/" active={category === undefined} label="Todos" />
        {CATEGORIES.map((key) => (
          <FilterLink
            key={key}
            href={`/?category=${key}`}
            active={category === key}
            label={CATEGORY_LABELS[key]}
          />
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
