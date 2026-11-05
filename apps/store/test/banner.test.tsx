import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Banner } from '@/components/banner';
import { formatPrice } from '@/lib/format';

describe('AC-8.2: home banner controlled by new-banner', () => {
  it('AC-8.2: the flag on renders only the new banner', () => {
    const html = renderToStaticMarkup(<Banner kind="new" />);
    expect(html).toContain('data-banner="new"');
    expect(html).not.toContain('data-banner="default"');
    expect(html).toContain('Novidade');
  });

  it('AC-8.2: the flag off renders only the default banner', () => {
    const html = renderToStaticMarkup(<Banner kind="default" />);
    expect(html).toContain('data-banner="default"');
    expect(html).not.toContain('Novidade');
  });
});

describe('prices', () => {
  it('formats cents as reais', () => {
    expect(formatPrice(12_790).replace(/\s/g, ' ')).toBe('R$ 127,90');
  });
});
