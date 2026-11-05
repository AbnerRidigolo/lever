import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generateCatalog } from '../src/catalog/generate';

// pnpm --filter @lever/store catalog:generate: rewrites the versioned fictitious catalog.
const target = fileURLToPath(new URL('../src/catalog/products.json', import.meta.url));
const products = generateCatalog();
writeFileSync(target, `${JSON.stringify(products, null, 2)}\n`);
console.log(`Wrote ${String(products.length)} fictitious products to ${target}`);
