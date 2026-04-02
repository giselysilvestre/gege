/**
 * Preenche user_metadata.full_name nos usuários do Auth (aparece como "Display name" no painel).
 *
 * Uso (na pasta frontend, com .env.local contendo NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/backfill-auth-display-names.mjs
 *
 * Sobrescrever quem já tem nome:
 *   node scripts/backfill-auth-display-names.mjs --force
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Ajuste livre: e-mail em minúsculas -> nome exibido no Auth e no app. */
const DISPLAY_NAME_BY_EMAIL = {
  "gisely.teste+gege1@gmail.com": "Gisely",
  "cliente.gege+1774294142@gmail.com": "Cliente Gege",
  "qa1@arcca.io": "QA1",
  "qa2@arcca.io": "QA2",
  "renata@arcca.io": "Renata",
  "sidney@arcca.io": "Sidney",
  "tester@arcca.io": "Tester",
};

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(resolve(__dirname, "../.env.local"));

function nameFromEmail(email) {
  if (!email) return "Usuário";
  let local = email.split("@")[0] ?? "";
  local = local.replace(/\+.*$/, "").replace(/\./g, " ").trim();
  if (!local) return "Usuário";
  return local
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function pickDisplayName(email, existingMeta) {
  const key = (email || "").toLowerCase().trim();
  if (DISPLAY_NAME_BY_EMAIL[key]) return DISPLAY_NAME_BY_EMAIL[key];
  return nameFromEmail(email);
}

function hasDisplayInMeta(meta) {
  const m = meta || {};
  return !!(
    (typeof m.full_name === "string" && m.full_name.trim()) ||
    (typeof m.name === "string" && m.name.trim()) ||
    (typeof m.display_name === "string" && m.display_name.trim())
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error(
    "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: copie do Supabase → Settings → API para frontend/.env.local)."
  );
  process.exit(1);
}

const force = process.argv.includes("--force");
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
let updated = 0;
let skipped = 0;

while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  const users = data.users;
  for (const u of users) {
    const meta = { ...(u.user_metadata || {}) };
    if (hasDisplayInMeta(meta) && !force) {
      skipped++;
      continue;
    }
    const full_name = pickDisplayName(u.email, meta);
    const { error: upErr } = await admin.auth.admin.updateUserById(u.id, {
      user_metadata: { ...meta, full_name },
    });
    if (upErr) {
      console.error(u.email, upErr.message);
      continue;
    }
    updated++;
    console.log("OK", u.email, "->", full_name);
  }
  if (users.length < 200) break;
  page++;
}

console.log("Concluído:", { atualizados: updated, ignoradosJaComNome: skipped });
