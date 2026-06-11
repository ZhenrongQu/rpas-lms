import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './src/i18n/routing';
import { ADMIN_BASE } from './src/lib/admin/route';

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  // Admin lives outside the i18n surface — skip locale handling so /<slug>
  // is served directly instead of being redirected to /<locale>/<slug>.
  if (req.nextUrl.pathname.startsWith(ADMIN_BASE)) {
    return NextResponse.next();
  }
  return intlMiddleware(req);
}

export const config = {
  matcher: ['/', '/(en|zh)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
