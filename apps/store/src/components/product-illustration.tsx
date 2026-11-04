import type { Product } from '@/catalog/schema';
import { cn } from '@/lib/utils';

// Generated SVG instead of photos: no external images and no network (store plan, D11).
export function ProductIllustration({
  product,
  className,
}: {
  product: Pick<Product, 'name' | 'illustration'>;
  className?: string;
}) {
  const { hue, shape } = product.illustration;
  const fill = `hsl(${String(hue)} 55% 45%)`;
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={product.name}
      className={cn('aspect-square w-full rounded-md', className)}
      style={{ background: `hsl(${String(hue)} 60% 92%)` }}
    >
      {shape === 'circle' ? <circle cx="50" cy="50" r="28" fill={fill} /> : null}
      {shape === 'square' ? <rect x="24" y="24" width="52" height="52" rx="6" fill={fill} /> : null}
      {shape === 'triangle' ? <polygon points="50,20 80,78 20,78" fill={fill} /> : null}
      {shape === 'diamond' ? <polygon points="50,18 82,50 50,82 18,50" fill={fill} /> : null}
    </svg>
  );
}
