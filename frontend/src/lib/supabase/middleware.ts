import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Roda no Edge (Vercel). Evitar throw (vira MIDDLEWARE_INVOCATION_FAILED).
 * Não usar APIs Node (fs, path, crypto do Node, Buffer global inexistente no Edge antigo).
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: User | null;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return { response: NextResponse.next({ request }), user: null };
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Atualizar o request ajuda Server Components a ver o JWT já refrescado (Supabase).
        // No Edge da Vercel, `request.cookies.set` às vezes não existe ou lança — aí só gravamos na response.
        try {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
        } catch {
          /* somente response.cookies abaixo */
        }
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      return { response, user: null };
    }
    return { response, user: user ?? null };
  } catch {
    return { response, user: null };
  }
}
