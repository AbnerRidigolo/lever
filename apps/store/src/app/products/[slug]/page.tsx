import { notFound } from 'next/navigation';

import { findProductBySlug } from '@/catalog/catalog';
import { CATEGORY_LABELS } from '@/catalog/schema';
import { ProductIllustration } from '@/components/product-illustration';
import { PageTitle } from '@/components/ui';
import { formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = findProductBySlug((await params).slug);
  if (product === undefined) notFound();

  return (
    <article className="grid gap-8 md:grid-cols-2">
      <ProductIllustration product={product} className="max-w-md" />
      <div className="flex flex-col gap-3">
        <span className="text-sm text-neutral-500">{CATEGORY_LABELS[product.category]}</span>
        <PageTitle>{product.name}</PageTitle>
        <p className="text-neutral-700 dark:text-neutral-300">{product.description}</p>
        <p className="text-2xl font-semibold" data-testid="product-price">
          {formatPrice(product.priceCents)}
        </p>
      </div>
    </article>
  );
}
