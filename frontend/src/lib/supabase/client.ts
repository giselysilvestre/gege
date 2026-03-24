"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Alias usado pelas páginas client do Figma Make */
export function createClient() {
  return getSupabaseBrowserClient();
}
