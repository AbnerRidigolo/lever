import { createHmac, timingSafeEqual } from 'node:crypto';

// HMAC-SHA-256 signature of the fictitious account cookie (store plan, D4 and Q2).

function mac(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signValue(value: string, secret: string): string {
  return `${value}.${mac(value, secret)}`;
}

/** The value when the signature matches; undefined for anything else. */
export function verifySignedValue(signed: string | undefined, secret: string): string | undefined {
  if (signed === undefined) return undefined;
  const separator = signed.lastIndexOf('.');
  if (separator <= 0) return undefined;
  const value = signed.slice(0, separator);
  const given = Buffer.from(signed.slice(separator + 1));
  const expected = Buffer.from(mac(value, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : undefined;
}
