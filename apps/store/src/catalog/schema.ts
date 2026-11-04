import { z } from 'zod';

// Store-only domain: the catalog is not a contract between packages (store plan, D11).

export const CATEGORIES = ['casa', 'cozinha', 'escritorio', 'lazer'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  casa: 'Casa',
  cozinha: 'Cozinha',
  escritorio: 'Escritório',
  lazer: 'Lazer',
};

export const ILLUSTRATION_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;

export const productIdSchema = z.string().regex(/^prd-\d{4}$/);

export const productSchema = z.object({
  id: productIdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  category: categorySchema,
  priceCents: z.int().positive(),
  illustration: z.object({
    hue: z.int().min(0).max(359),
    shape: z.enum(ILLUSTRATION_SHAPES),
  }),
});
export type Product = z.infer<typeof productSchema>;

export const catalogSchema = z.array(productSchema).superRefine((products, ctx) => {
  for (const field of ['id', 'slug'] as const) {
    const seen = new Set<string>();
    products.forEach((product, index) => {
      if (seen.has(product[field])) {
        ctx.addIssue({ code: 'custom', message: `duplicate ${field}`, path: [index, field] });
      }
      seen.add(product[field]);
    });
  }
});
