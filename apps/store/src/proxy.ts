import { NextResponse, type NextRequest } from 'next/server';

import { COOKIES, cookieOptions } from '@/server/cookies';
import { isValidUid, newUid } from '@/server/user';

/**
 * Gives every visitor an anonymous id (AC-8.4, store plan D3). Server Components cannot set
 * cookies, so the proxy sets it on the response and also on the request being handled:
 * the first visit is already evaluated with the id the browser will keep (AC-8.5).
 */
export function proxy(request: NextRequest): NextResponse {
  if (isValidUid(request.cookies.get(COOKIES.uid)?.value)) return NextResponse.next();

  const uid = newUid();
  request.cookies.set(COOKIES.uid, uid);
  const headers = new Headers(request.headers);
  headers.set('cookie', request.cookies.toString());

  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(COOKIES.uid, uid, cookieOptions('uid'));
  return response;
}

export const config = {
  // Pages and Server Actions only: not static assets nor the Prometheus endpoint.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|metrics).*)'],
};
