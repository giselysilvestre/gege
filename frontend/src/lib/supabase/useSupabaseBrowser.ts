"use client";

import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Retorna o cliente Supabase apenas no browser.
 * Evita createBrowserClient durante o SSR do Next: o @supabase/ssr lança se a auth
 * tentar gravar cookies no pré-render sem ambiente de documento.
 */
export function useSupabaseBrowser(): SupabaseClient | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    return getSupabaseBrowserClient();
  }, []);
}
