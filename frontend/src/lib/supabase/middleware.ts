import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} no frontend/.env.local`);
  return value;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser valida o JWT com o Auth (getSession confia só no cookie local).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user: user ?? null };
}
