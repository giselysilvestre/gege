import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const env = readFileSync(envPath, "utf8");
for (const line of env.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  process.env[k] = v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing env", { url: !!url, key: !!key });
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const tests = [
    ["vagas+clientes", () =>
      supabase.from("vagas").select("id,cargo,titulo_publicacao,cliente_id,clientes(nome_empresa)").limit(2)],
    ["sessoes", () =>
      supabase
        .from("whatsapp_sessoes")
        .select(
          "id,candidato_id,candidatura_id,etapa_atual,etapa_funil,status,ultima_inbound_at,ultima_outbound_at,primeira_resposta_at,resumo_ia,reativacao_enviada,criado_em"
        )
        .order("atualizado_em", { ascending: false })
        .limit(2)],
    ["candidaturas motivo", () =>
      supabase.from("candidaturas").select("id,vaga_id,motivo_reprovacao").limit(2)],
  ];

  for (const [name, fn] of tests) {
    const { data, error } = await fn();
    if (error) console.log(name, "ERR:", error.message, error.details, error.hint);
    else console.log(name, "ok", data?.length);
  }

  const { data: sessoes } = await supabase
    .from("whatsapp_sessoes")
    .select("id,candidatura_id")
    .limit(5000);
  const ids = [...new Set((sessoes ?? []).map((s) => s.candidatura_id).filter(Boolean))];
  console.log("candidatura ids", ids.length);
  if (ids.length > 0) {
    const chunk = ids.slice(0, 200);
    const { error } = await supabase
      .from("candidaturas")
      .select("id,vaga_id,candidato_id,status,distancia_km,motivo_reprovacao,score_compatibilidade")
      .in("id", chunk);
    console.log("candidaturas batch", error ? error.message : "ok");
  }
}

run();
