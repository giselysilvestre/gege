// Import relativo: na Vercel (Edge) o alias "@/" no middleware pode não ser resolvido e vira módulo inválido.
import { updateSession } from "./src/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

function isStaticAsset(pathname: string) {
  if (pathname.startsWith("/branding")) return true;
  if (pathname === "/favicon.ico") return true;
  return /\.(ico|png|jpg|jpeg|svg|gif|webp|woff2?)$/i.test(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  try {
    const { response, user } = await updateSession(request);

    if (pathname === "/") {
      return NextResponse.redirect(new URL(user ? "/dashboard" : "/login", request.url));
    }

    if (pathname.startsWith("/login") && user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const isPublicPath =
      pathname.startsWith("/login") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/gege-api");

    if (!isPublicPath && !user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch (e) {
    console.error("[middleware]", e);
    if (pathname === "/" || pathname.startsWith("/login")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
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
