import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} no frontend/.env.local`);
  return value;
}

function createServerSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>, setAllSafe: boolean) {
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (setAllSafe) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            /* Server Component: middleware costuma refrescar a sessão. */
          }
          return;
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/** Server Components / layouts: set em cookies pode falhar; middleware cobre refresh. */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerSupabase(cookieStore, true);
}

/**
 * Route Handlers (app/api/...): aqui `cookies().set` entra na resposta HTTP.
 * Sem try/catch — refresh de token após getUser/getSession persiste no browser.
 */
export async function getSupabaseRouteHandlerClient() {
  const cookieStore = await cookies();
  return createServerSupabase(cookieStore, false);
}

/** Alias usado pelas páginas migradas do Figma Make */
export async function createClient() {
  return getSupabaseServerClient();
}