import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchVagas,
  fetchCrmRows,
  buildMetrics,
  buildDashboard,
  enrichDashboardActivity,
} from "../src/lib/crm/fetchCrmData.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
for (const line of env.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

try {
  const vagas = await fetchVagas(supabase);
  console.log("vagas", vagas.length);
  const t0 = Date.now();
  const rows = await fetchCrmRows(supabase, "727b77c2-8058-409a-aef0-81de6bb5ccc1");
  console.log("fetchCrmRows ms", Date.now() - t0);
  console.log("rows", rows.length);
  const metrics = buildMetrics(rows, rows.length);
  let dashboard = buildDashboard(rows);
  dashboard = await enrichDashboardActivity(
    supabase,
    null,
    dashboard,
    rows.map((r) => r.sessao_id)
  );
  console.log("metrics", metrics.abordados);
  console.log("OK");
} catch (e) {
  console.error("FAIL", e);
  process.exit(1);
}
