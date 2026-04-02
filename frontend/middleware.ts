import { NextResponse, type NextRequest } from "next/server";

function isStaticAsset(pathname: string) {
  if (pathname.startsWith("/branding")) return true;
  if (pathname === "/favicon.ico") return true;
  return /\.(ico|png|jpg|jpeg|svg|gif|webp|woff2?)$/i.test(pathname);
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.includes("sb-") && name.includes("auth-token"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const hasSession = hasSupabaseAuthCookie(request);

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/dashboard" : "/login", request.url));
  }

  if (pathname.startsWith("/login") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/gege-api");

  if (!isPublicPath && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto arquivos internos do Next em /_next/…
     * (chunks, HMR, source maps). Assim o browser nunca recebe HTML de /login
     * no lugar de um .js.
     */
    "/((?!_next/).*)",
  ],
};
