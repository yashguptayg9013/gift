import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection (Next 16 `proxy`, formerly middleware). This is a coarse gate on
 * cookie presence only — the API validates the session and enforces every
 * permission. Users with only a refresh cookie are let through; the client
 * refreshes the access token transparently.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('puja_at') || request.cookies.has('puja_rt');
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = hasSession ? '/overview' : '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API proxying, Next internals and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
};
