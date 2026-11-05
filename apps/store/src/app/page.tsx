import { listProducts } from '@/catalog/catalog';
import { categorySchema } from '@/catalog/schema';
import { Banner } from '@/components/banner';
import { ProductGrid } from '@/components/product-grid';
import { isNewBannerOn } from '@/lever';

// Evaluated on every request, on the server: no cached page of another user and no flash
// of the wrong banner (AC-8.5, store plan D6).
export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = categorySchema.safeParse((await searchParams).category);
  const category = parsed.success ? parsed.data : undefined;
  const newBanner = await isNewBannerOn();

  return (
    <div className="flex flex-col gap-8">
      <Banner kind={newBanner ? 'new' : 'default'} />
      <ProductGrid products={listProducts(category)} category={category} />
    </div>
  );
}
