import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxy } from '@/proxy';
import { COOKIES } from '@/server/cookies';
import { isValidUid } from '@/server/user';

const UID = '3f1c8a52-6b7d-4e0f-9a21-5c4d3b2a1f00';

function request(cookie?: string): NextRequest {
  return new NextRequest('http://localhost:3002/', {
    headers: cookie === undefined ? {} : { cookie },
  });
}

/** Cookies that the handled request will see (header set by NextResponse.next({ request })). */
function forwardedCookie(response: Response): string | null {
  return response.headers.get('x-middleware-request-cookie');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AC-8.4: anonymous id cookie set by the proxy', () => {
  it('AC-8.4: creates lever_uid on the first visit with the planned flags', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = proxy(request());
    const cookie = response.cookies.get(COOKIES.uid);
    expect(isValidUid(cookie?.value)).toBe(true);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
  });

  it('AC-8.5: the first request is handled with the same id the browser receives', () => {
    const response = proxy(request('lever_cart=[]'));
    const uid = response.cookies.get(COOKIES.uid)?.value ?? '';
    expect(forwardedCookie(response)).toContain(`${COOKIES.uid}=${uid}`);
    expect(forwardedCookie(response)).toContain('lever_cart=');
  });

  it('AC-8.4: keeps a valid id untouched', () => {
    const response = proxy(request(`${COOKIES.uid}=${UID}`));
    expect(response.cookies.get(COOKIES.uid)).toBeUndefined();
    expect(forwardedCookie(response)).toBeNull();
  });

  it('AC-8.4: replaces an invalid id', () => {
    const response = proxy(request(`${COOKIES.uid}=tampered`));
    const uid = response.cookies.get(COOKIES.uid)?.value;
    expect(isValidUid(uid)).toBe(true);
    expect(uid).not.toBe('tampered');
  });

  it('is not secure outside production builds', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(proxy(request()).cookies.get(COOKIES.uid)?.secure).toBe(false);
  });
});
