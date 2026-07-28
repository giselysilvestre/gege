import { NextResponse } from "next/server";
import { isKapsoConfigured } from "@/lib/kapsoConfig";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const kapsoReady = isKapsoConfigured();
  let supabaseReady = false;
  try {
    getSupabaseAdmin();
    supabaseReady = true;
  } catch {
    supabaseReady = false;
  }

  return NextResponse.json({
    kapsoReady,
    supabaseReady,
    manualSendEnabled: kapsoReady && supabaseReady,
  });
}
