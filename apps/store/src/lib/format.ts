const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formats a price in cents as Brazilian reais (store plan, D12). */
export function formatPrice(cents: number): string {
  return brl.format(cents / 100);
}
