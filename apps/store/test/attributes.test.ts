import { describe, expect, it } from 'vitest';

import {
  countryFromAcceptLanguage,
  deviceFromUserAgent,
  personaSchema,
  resolveAttributes,
} from '@/server/attributes';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
};

describe('AC-8.4: device attribute from the User-Agent', () => {
  it.each([
    [UA.iphone, 'mobile'],
    [UA.androidPhone, 'mobile'],
    [UA.androidTablet, 'tablet'],
    [UA.ipad, 'tablet'],
    [UA.desktop, 'desktop'],
    ['', 'desktop'],
    [null, 'desktop'],
  ] as const)('AC-8.4: %s → %s', (userAgent, device) => {
    expect(deviceFromUserAgent(userAgent)).toBe(device);
  });
});

describe('AC-8.4: country attribute from Accept-Language', () => {
  it.each([
    ['pt-BR,pt;q=0.9,en;q=0.8', 'BR'],
    ['en-us', 'US'],
    ['pt;q=0.9,en-GB;q=0.8', 'GB'],
    ['en-US;q=0.5,pt-PT;q=0.9', 'PT'],
    ['zh-Hant-TW', 'TW'],
    ['es-419', undefined],
    ['pt, en', undefined],
    ['*', undefined],
    ['pt-BR;q=0', undefined],
    ['', undefined],
    [null, undefined],
  ] as const)('AC-8.4: %s → %s', (header, country) => {
    expect(countryFromAcceptLanguage(header)).toBe(country);
  });
});

describe('AC-8.4: resolved attributes', () => {
  it('AC-8.4: uses the headers without a persona', () => {
    expect(
      resolveAttributes({ userAgent: UA.iphone, acceptLanguage: 'pt-BR', persona: undefined }),
    ).toEqual({ country: 'BR', device: 'mobile' });
  });

  it('AC-4.4: leaves the country absent when no language has a region', () => {
    const attributes = resolveAttributes({
      userAgent: UA.desktop,
      acceptLanguage: 'pt',
      persona: undefined,
    });
    expect(attributes).toEqual({ device: 'desktop' });
    expect('country' in attributes).toBe(false);
  });

  it('AC-8.4: the demo persona overrides each header it sets', () => {
    expect(
      resolveAttributes({
        userAgent: UA.desktop,
        acceptLanguage: 'pt-BR',
        persona: { country: 'US' },
      }),
    ).toEqual({ country: 'US', device: 'desktop' });
    expect(
      resolveAttributes({
        userAgent: UA.desktop,
        acceptLanguage: 'pt-BR',
        persona: { device: 'mobile' },
      }),
    ).toEqual({ country: 'BR', device: 'mobile' });
  });

  it('rejects personas outside the demo options', () => {
    expect(personaSchema.safeParse({ country: 'XX' }).success).toBe(false);
    expect(personaSchema.safeParse({ device: 'watch' }).success).toBe(false);
  });
});
