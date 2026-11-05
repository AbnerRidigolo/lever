import Link from 'next/link';

import { CATEGORY_LABELS, type Product } from '@/catalog/schema';
import { formatPrice } from '@/lib/format';

import { ProductIllustration } from './product-illustration';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      data-testid="product-card"
      className="group flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      <ProductIllustration product={product} />
      <span className="text-xs text-neutral-500">{CATEGORY_LABELS[product.category]}</span>
      <span className="font-medium group-hover:underline">{product.name}</span>
      <span className="text-sm font-semibold">{formatPrice(product.priceCents)}</span>
    </Link>
  );
}
