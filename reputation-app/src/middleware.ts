import { type NextRequest, NextResponse } from 'next/server';

import { getEnvVar } from '@/utils/get-env-var';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_ROUTES = ['/login', '/signup', '/auth', '/pricing'];
const ADMIN_ROUTES = ['/admin'];
const ONBOARDING_ROUTE = '/onboarding';
const DASHBOARD_ROUTE = '/dashboard';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANT: do not place any logic between createServerClient and getUser()
  const { data: { user } } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));

  // Unauthenticated — redirect to login for any non-public route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated — redirect away from auth pages to dashboard
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = DASHBOARD_ROUTE;
    return NextResponse.redirect(url);
  }

  // Admin route protection — only users with admin role or ADMIN_EMAIL
  if (user && isAdminRoute) {
    const isAdmin =
      user.user_metadata?.role === 'admin' ||
      user.email === process.env.ADMIN_EMAIL;
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = DASHBOARD_ROUTE;
      return NextResponse.redirect(url);
    }
  }

  // Dashboard — gate on onboarding completion
  if (user && pathname.startsWith(DASHBOARD_ROUTE)) {
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!business && pathname !== ONBOARDING_ROUTE) {
      const url = request.nextUrl.clone();
      url.pathname = ONBOARDING_ROUTE;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
