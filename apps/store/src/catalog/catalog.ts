import products from './products.json';
import { catalogSchema, type Category, type Product } from './schema';

// Validated once when the module loads: a broken products.json fails fast.
const catalog: readonly Product[] = catalogSchema.parse(products);
const byId = new Map(catalog.map((product) => [product.id, product]));
const bySlug = new Map(catalog.map((product) => [product.slug, product]));

export function listProducts(category?: Category): readonly Product[] {
  return category === undefined ? catalog : catalog.filter((p) => p.category === category);
}

export function findProductById(id: string): Product | undefined {
  return byId.get(id);
}

export function findProductBySlug(slug: string): Product | undefined {
  return bySlug.get(slug);
}
