import { z } from 'zod';

// User attributes `country` and `device` (AC-8.4, store plan D2).

export const DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export const deviceSchema = z.enum(DEVICES);
export type Device = z.infer<typeof deviceSchema>;

/** Countries offered by the demo persona selector. */
export const PERSONA_COUNTRIES = ['BR', 'US', 'PT', 'AR'] as const;

/** Demo persona chosen in the Lever panel; each field overrides the request headers. */
export const personaSchema = z.object({
  country: z.enum(PERSONA_COUNTRIES).optional(),
  device: deviceSchema.optional(),
});
export type Persona = z.infer<typeof personaSchema>;

export interface StoreAttributes {
  country?: string;
  device: Device;
}

/** `tablet` before `mobile`: Android tablets do not send `Mobile`. */
export function deviceFromUserAgent(userAgent: string | null | undefined): Device {
  if (userAgent === null || userAgent === undefined || userAgent === '') return 'desktop';
  if (/iPad|Tablet/i.test(userAgent)) return 'tablet';
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'mobile' : 'tablet';
  if (/Mobi|iPhone|iPod/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

/**
 * Region of the preferred language that has one (`pt-BR;q=0.9` → `BR`), or undefined.
 * Without a region the attribute stays absent, so it never matches a rule (AC-4.4).
 */
export function countryFromAcceptLanguage(header: string | null | undefined): string | undefined {
  if (header === null || header === undefined) return undefined;
  const languages = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { tag, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((language) => language.tag !== '' && language.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { tag } of languages) {
    const region = tag
      .split('-')
      .slice(1)
      .find((subtag) => /^[a-z]{2}$/i.test(subtag));
    if (region !== undefined) return region.toUpperCase();
  }
  return undefined;
}

/** Attributes of a request: the persona wins over the headers. */
export function resolveAttributes(input: {
  userAgent: string | null | undefined;
  acceptLanguage: string | null | undefined;
  persona: Persona | undefined;
}): StoreAttributes {
  const country = input.persona?.country ?? countryFromAcceptLanguage(input.acceptLanguage);
  const device = input.persona?.device ?? deviceFromUserAgent(input.userAgent);
  return country === undefined ? { device } : { country, device };
}
