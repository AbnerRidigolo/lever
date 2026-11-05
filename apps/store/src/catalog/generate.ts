import {
  CATEGORIES,
  ILLUSTRATION_SHAPES,
  catalogSchema,
  type Category,
  type Product,
} from './schema';

// Deterministic generator of the fictitious catalog (AC-8.1, store plan D11).
// Same seed, same catalog: the output is versioned in products.json.

export const CATALOG_SEED = 20_261_103;
const PRODUCTS_PER_CATEGORY = 6;

const NOUNS: Record<Category, readonly string[]> = {
  casa: ['Almofada', 'Manta', 'Vaso', 'Luminária', 'Tapete', 'Quadro', 'Cesto', 'Espelho'],
  cozinha: ['Caneca', 'Panela', 'Tábua', 'Jarra', 'Bule', 'Travessa', 'Fruteira', 'Avental'],
  escritorio: ['Caderno', 'Agenda', 'Organizador', 'Estojo', 'Suporte', 'Porta-lápis', 'Bloco'],
  lazer: ['Mochila', 'Garrafa', 'Rede', 'Toalha', 'Bola', 'Cantil', 'Esteira', 'Lanterna'],
};

const COLLECTIONS = [
  'Aurora',
  'Brisa',
  'Cerrado',
  'Duna',
  'Estrela',
  'Floresta',
  'Maré',
  'Nuvem',
  'Orvalho',
  'Serra',
  'Ipê',
  'Lagoa',
] as const;

const PHRASES = [
  'feito para durar e combinar com tudo',
  'leve, prático e fácil de limpar',
  'com acabamento artesanal e cores suaves',
  'ideal para presentear ou usar no dia a dia',
  'produzido em pequenos lotes fictícios',
  'com design simples e materiais resistentes',
] as const;

/** mulberry32: small seeded PRNG, enough for reproducible fictitious data. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('cannot pick from an empty list');
  return item;
}

function shuffled<T>(random: () => number, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Generates the catalog for a seed and validates it against the schema. */
export function generateCatalog(seed: number = CATALOG_SEED): Product[] {
  const random = createRandom(seed);
  const products: Product[] = [];

  for (const category of CATEGORIES) {
    const nouns = shuffled(random, NOUNS[category]).slice(0, PRODUCTS_PER_CATEGORY);
    const collections = shuffled(random, COLLECTIONS);
    nouns.forEach((noun, index) => {
      const collection = collections[index] ?? pick(random, COLLECTIONS);
      const name = `${noun} ${collection}`;
      const reais = 19 + Math.floor(random() * 231);
      products.push({
        id: `prd-${String(products.length + 1).padStart(4, '0')}`,
        slug: slugify(name),
        name,
        description: `${noun} da linha ${collection}, ${pick(random, PHRASES)}.`,
        category,
        priceCents: reais * 100 + 90,
        illustration: {
          hue: Math.floor(random() * 360),
          shape: pick(random, ILLUSTRATION_SHAPES),
        },
      });
    });
  }

  return catalogSchema.parse(products);
}
