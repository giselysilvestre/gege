require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { google } = require("googleapis");
const pdfParse = require('pdf-parse');
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

const MAX_EMAILS = 5;
const GMAIL_QUERY = "has:attachment filename:pdf newer_than:30d";

const JOB_BOARD_DOMAINS = ["indeedemail.com", "vagas.com", "catho.com.br", "infojobs.com.br", "sine.com.br"];

const DRIVE_ROOT_FOLDER = "Gegê CVs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Defina ${name} no arquivo .env`);
  return String(v).trim();
}

function getHeader(headers, name) {
  const hit = (headers || []).find((h) => String(h.name || "").toLowerCase() === name.toLowerCase());
  return hit ? String(hit.value || "") : "";
}

function parseFromEmail(fromHeader) {
  const s = String(fromHeader || "");
  const angled = s.match(/<([^>]+)>/);
  const email = (angled?.[1] || s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").trim();
  return email ? email.toLowerCase() : null;
}

function domainFromFromHeader(fromHeader) {
  const email = parseFromEmail(fromHeader);
  if (!email || !email.includes("@")) return null;
  return email.split("@").pop() || null;
}

function isJobBoardDomain(domain) {
  if (!domain) return false;
  return JOB_BOARD_DOMAINS.some((d) => domain.includes(d));
}

function origemFromDomain(domain) {
  if (!domain) return null;
  if (domain.includes("indeedemail.com")) return "Indeed";
  if (domain.includes("vagas.com")) return "Vagas.com";
  if (domain.includes("catho.com.br")) return "Catho";
  if (domain.includes("infojobs.com.br")) return "InfoJobs";
  if (domain.includes("sine.com.br")) return "Sine";
  return domain;
}

function yearMonthNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function sanitizeFileNamePart(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeEmail(v) {
  const s = String(v || "").trim().toLowerCase();
  return s || null;
}

function normalizeTelefoneStrict(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const d = digits.startsWith("55") ? digits : `55${digits}`;
  const m = d.match(/^55(\d{2})(9\d{8})$/);
  if (!m) return null;
  const dd = m[1];
  const num = m[2];
  return `+55 ${dd} ${num.slice(0, 5)}-${num.slice(5)}`;
}

function normalizeNomeComPreposicoes(nome) {
  const raw = String(nome || "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const preps = new Set(["da", "de", "do", "dos", "das", "e"]);
  return lower
    .split(" ")
    .map((p) => (preps.has(p) ? p : p ? p[0].toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

function toNullableString(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function toNullableInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** Igual ao schema Supabase: só IA → final = IA; IA + pós → 0,4×IA + 0,6×pós. */
function computeScoreFinalFromIaEPos(scoreIa, scorePos) {
  if (scoreIa == null && scorePos == null) return null;
  if (scorePos == null) return scoreIa;
  if (scoreIa == null) return scorePos;
  return Number((0.4 * scoreIa + 0.6 * scorePos).toFixed(2));
}

function unwrapJsonOnly(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Resposta vazia do Claude.");
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  throw new Error("Claude não retornou JSON válido.");
}

async function loadGoogleAuth() {
  const [credRaw, tokenRaw] = await Promise.all([fs.readFile(CREDENTIALS_PATH, "utf8"), fs.readFile(TOKEN_PATH, "utf8")]);
  const creds = JSON.parse(credRaw);
  const token = JSON.parse(tokenRaw);
  const cfg = creds.installed || creds.web;
  if (!cfg) throw new Error("credentials.json inválido (esperado 'installed' ou 'web').");
  const auth = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, cfg.redirect_uris[0]);
  auth.setCredentials(token);
  return auth;
}

async function listMessages(gmail, userId) {
  const res = await gmail.users.messages.list({ userId, q: GMAIL_QUERY, maxResults: MAX_EMAILS });
  return res.data.messages || [];
}

function collectPdfParts(part, out) {
  if (!part) return;
  const filename = String(part.filename || "");
  const body = part.body || {};
  if (filename.toLowerCase().endsWith(".pdf") && body.attachmentId) {
    out.push({ filename, attachmentId: body.attachmentId });
  }
  for (const child of part.parts || []) collectPdfParts(child, out);
}

async function getMessageAndPdfParts(gmail, userId, messageId) {
  const msgRes = await gmail.users.messages.get({ userId, id: messageId, format: "full" });
  const payload = msgRes.data.payload || {};
  const pdfParts = [];
  collectPdfParts(payload, pdfParts);
  return { message: msgRes.data, pdfParts };
}

function decodeBase64Url(data) {
  const base64 = String(data || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

async function downloadAttachment(gmail, userId, messageId, attachmentId) {
  const res = await gmail.users.messages.attachments.get({ userId, messageId, id: attachmentId });
  return decodeBase64Url(res.data.data || "");
}

async function extractPdfText(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return (data && data.text) ? data.text.trim() : '';
  } catch (err) {
    return '';
  }
}

function escapeDriveQueryValue(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateFolder(drive, name, parentId) {
  const parentFilter = parentId ? `'${parentId}' in parents and ` : "";
  const q = `${parentFilter}mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapeDriveQueryValue(name)}'`;
  const list = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  const found = list.data.files?.[0];
  if (found?.id) return found.id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
    fields: "id",
  });
  if (!created.data.id) throw new Error(`Falha ao criar pasta no Drive: ${name}`);
  return created.data.id;
}

async function uploadPdfToDrivePublic(drive, buffer, parentId, fileName) {
  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [parentId], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id",
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("Falha ao fazer upload do PDF para o Drive.");

  await drive.permissions.create({ fileId, requestBody: { type: "anyone", role: "reader" } });
  const links = await drive.files.get({ fileId, fields: "webViewLink, webContentLink" });
  return links.data.webViewLink || links.data.webContentLink || `https://drive.google.com/file/d/${fileId}/view`;
}

async function callClaude(anthropic, cvText) {
  const hoje = new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
  const prompt = `A data de hoje é ${hoje}. Use como referência absoluta para calcular durações, identificar empregos atuais e avaliar se datas são passadas ou futuras.

Você é recrutador sênior em food service. Retorne APENAS JSON válido, sem markdown.

{
  "candidato": {
    "nome": "Capitalizar cada palavra exceto preposições (da, de, do, dos, das, e)",
    "telefone": "Formato +55 DD 9XXXX-XXXX ou null se incompleto/sem DDD",
    "email": "minúsculo sem espaços ou null",
    "cargo_principal": "cargo do último emprego ou null",
    "cidade": "apenas se explícito ou null",
    "bairro": "apenas se explícito ou null",
    "cep": "formato 00000-000, apenas se explícito, não inferir, ou null",
    "escolaridade": "nível mais alto concluído ou em andamento ou null",
    "genero": "Masculino | Feminino | Não informado (inferir pelo primeiro nome)",
    "data_nascimento": "YYYY-MM-DD se explícito, não inferir, ou null",
    "situacao_emprego": "Empregado se: último emprego sem data de fim OU texto contém 'atual', 'atualmente', 'presente', 'até o momento'. Desempregado se último emprego tem data de fim anterior a hoje. null se não inferível."
  },
  "experiencias": [
    {
      "empresa": "nome da empresa",
      "cargo": "cargo exercido ou null",
      "setor": "alimentacao (restaurantes, catering, food service industrial, lanchonetes) | cozinha (função específica de preparo de alimentos) | atendimento (atendimento ao cliente DENTRO de food service — NÃO contar telemarketing, call center, banco, varejo geral) | lideranca (gestão de pessoas em food service) | outro (tudo fora de food service)",
      "data_inicio": "YYYY-MM-DD ou null",
      "data_fim": "YYYY-MM-DD ou null se emprego atual",
      "meses": "calcular pelas datas usando hoje como referência para empregos sem data_fim. Estimar pelo texto se datas ausentes.",
      "eh_lideranca": "true só se cargo envolve gestão direta de pessoas com evidência no texto (supervisor, gerente, coordenador com equipe descrita). false caso contrário.",
      "crescimento_interno": "true só se houve mudança de cargo com escopo CRESCENTE na mesma empresa — títulos diferentes e progressão clara. NÃO marcar true para contratos distintos na mesma empresa sem progressão de cargo."
    }
  ],
  "analise": {
    "perfil_resumo": "cargo predominante + tempo total de experiência relevante em food service",
    "pontos_fortes": "Texto corrido em linguagem natural, sem labels ou categorias em maiúsculo. Liste apenas evidências rastreáveis no CV, priorizando: permanência longa em food service (>18 meses = relevante, >36 meses = forte), empresa reconhecida do setor (Novotel, Accor, Outback, Coco Bambu, Madero, Fogo de Chão, Spoleto, Starbucks, Eataly, Fasano, McDonald's, Bob's, Subway, Sodexo, Compass), responsabilidades específicas descritas com verbos concretos, conquistas mensuráveis, progressão real de cargo, formação técnica com instituição identificável, iniciativa comprovada. NÃO aceitar autodeclaração, listas de habilidades ou objetivos profissionais. null se nenhuma evidência real.",
    "red_flags": "Texto corrido em linguagem natural, sem labels ou categorias em maiúsculo. Liste apenas fatos concretos com trecho literal entre aspas quando disponível, priorizando por severidade: linguagem de conflito ou rescisão negociada (ex: 'fiz acordo', 'pedi pra sair pq'), inconsistência factual de datas, tenure médio abaixo de 6 meses em 2 ou mais empregos consecutivos, gap não explicado acima de 12 meses, CV sem nenhuma data, erros graves de português, mistura de setores sem fio condutor, zero experiência em food service. null se nenhum identificado.",
    "fit_food_service": "Alto: experiência direta em food service com permanência acima de 12 meses. Médio: formação técnica específica em gastronomia com instituição identificável, OU experiência em atendimento dentro de food service. Baixo: sem experiência ou formação relevante para o setor.",
    "analise_completa": "[Nome] é [cargo predominante] com [tempo de experiência relevante].\n\nO que chama atenção positivamente: [escolha O ÚNICO fato mais relevante dos pontos_fortes — não repita todos].\nO que preocupa: [escolha O ÚNICO fato mais grave dos red_flags — não repita todos].\nRecomendação: Chamar para triagem | Triagem com ressalva | Não priorizar — [fator decisivo em 1 linha direta, sem repetir o que já foi dito acima].",
    "score_ia": "0-100 sem ancoragem em valores anteriores. Critérios: experiência direta e relevante em food service com permanência (40%), estabilidade dos vínculos (30%), evidências comportamentais positivas rastreáveis no texto (30%). Escala: 0-20 sem relevância, 21-40 baixa, 41-60 média, 61-80 boa aderência, 81-100 candidato forte.",
    "ultima_experiencia": "Empresa — cargo, duração. Ex: Gastroservice — Cozinheira, 8 anos e 7 meses"
  }
}

CV:
"""${cvText}"""`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2400,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (msg.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const jsonText = unwrapJsonOnly(text);
  return JSON.parse(jsonText);
}

function computeTags(experiencias) {
  const exps = Array.isArray(experiencias) ? experiencias : [];
  const tags = [];

  if (exps.some((e) => e && e.crescimento_interno)) tags.push("crescimento");

  const mesesFood = exps
    .filter((e) => e && ["alimentacao", "cozinha", "atendimento"].includes(String(e.setor || "")))
    .reduce((s, e) => s + (Number(e.meses) || 0), 0);
  if (mesesFood > 12) tags.push("food");

  const mesesLideranca = exps.filter((e) => e && e.eh_lideranca).reduce((s, e) => s + (Number(e.meses) || 0), 0);
  if (mesesLideranca > 12) tags.push("lideranca");

  const vinculos = exps.length;
  const curtos = exps.filter((e) => (Number(e?.meses) || 0) < 5 && (Number(e?.meses) || 0) > 0).length;
  if (curtos > 3 || (vinculos > 0 && curtos / vinculos > 0.5)) tags.push("alerta_instabilidade");

  if (vinculos === 0 || exps.every((e) => !e?.meses || Number(e.meses) === 0)) tags.push("primeiro_emprego");
  return tags;
}

async function findDuplicateCandidatoId(supabase, telefone, email) {
  if (telefone) {
    const { data, error } = await supabase.from("candidatos").select("id").eq("telefone", telefone).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  if (email) {
    const { data, error } = await supabase.from("candidatos").select("id").eq("email", email).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  return null;
}

async function processEmail({ gmail, drive, anthropic, supabase, userId, rootFolderId, monthFolderId, messageId, idx, total }) {
  console.log(`\n[${idx}/${total}] Processando email ${messageId}...`);

  const { message, pdfParts } = await getMessageAndPdfParts(gmail, userId, messageId);
  const fromHeader = getHeader(message.payload?.headers, "from");
  const domain = domainFromFromHeader(fromHeader);

  if (!isJobBoardDomain(domain)) {
    console.log(" - remetente não é job board, pulando.");
    return { status: "skipped_not_jobboard" };
  }

  if (!pdfParts.length) {
    console.log(" - sem PDF, pulando.");
    return { status: "skipped_no_pdf" };
  }

  const pdf = pdfParts[0];
  console.log(` - PDF encontrado: ${pdf.filename || "(sem nome)"}`);

  const pdfBuffer = await downloadAttachment(gmail, userId, messageId, pdf.attachmentId);
  const text = await extractPdfText(pdfBuffer);
  if (!text) {
    console.log(" - PDF sem texto extraível, pulando.");
    return { status: "skipped_empty_pdf" };
  }

  const extracted = await callClaude(anthropic, text);
  const cand = extracted?.candidato || {};

  const nome = normalizeNomeComPreposicoes(cand.nome);
  if (!nome) {
    console.log(" - nome vazio após extração, pulando.");
    return { status: "skipped_no_name" };
  }

  const telefone = normalizeTelefoneStrict(cand.telefone);
  const email = normalizeEmail(cand.email);
  const origem = origemFromDomain(domain);

  const safeName = sanitizeFileNamePart(nome) || "candidato";
  const fileName = `${safeName}_${messageId}.pdf`;
  const curriculoUrl = await uploadPdfToDrivePublic(drive, pdfBuffer, monthFolderId || rootFolderId, fileName);

  const candidatoPayload = {
    nome,
    telefone: telefone || null,
    email,
    cargo_principal: toNullableString(cand.cargo_principal),
    cidade: toNullableString(cand.cidade),
    bairro: toNullableString(cand.bairro),
    cep: toNullableString(cand.cep),
    escolaridade: toNullableString(cand.escolaridade),
    genero: toNullableString(cand.genero),
    data_nascimento: toNullableString(cand.data_nascimento),
    situacao_emprego: toNullableString(cand.situacao_emprego),
    origem,
    curriculo_url: curriculoUrl,
    gmail_message_id: messageId,
  };

  const dupId = await findDuplicateCandidatoId(supabase, telefone, email);
  let candidatoId;

  if (dupId) {
    const { error: upErr } = await supabase.from("candidatos").update(candidatoPayload).eq("id", dupId);
    if (upErr) throw new Error(`Falha ao atualizar candidato: ${upErr.message}`);

    const { error: delErr } = await supabase.from("candidatos_experiencia").delete().eq("candidato_id", dupId);
    if (delErr) throw new Error(`Falha ao remover experiencias: ${delErr.message}`);

    candidatoId = dupId;
  } else {
    const { data: inserted, error: insErr } = await supabase.from("candidatos").insert(candidatoPayload).select("id").single();
    if (insErr) throw new Error(`Falha ao inserir candidato: ${insErr.message}`);
    candidatoId = inserted.id;
  }

  const experiencias = Array.isArray(extracted?.experiencias) ? extracted.experiencias : [];
  const expRows = [];
  for (const e of experiencias) {
    const empresa = toNullableString(e?.empresa);
    if (!empresa) continue;
    expRows.push({
      candidato_id: candidatoId,
      empresa,
      cargo: toNullableString(e?.cargo),
      setor: String(e?.setor || "outro").replace(/\s/g, ""),
      data_inicio: toNullableString(e?.data_inicio),
      data_fim: toNullableString(e?.data_fim),
      meses: toNullableInt(e?.meses),
      eh_lideranca: typeof e?.eh_lideranca === "boolean" ? e.eh_lideranca : null,
      crescimento_interno: typeof e?.crescimento_interno === "boolean" ? e.crescimento_interno : null,
    });
  }
  if (expRows.length) {
    const { error: expErr } = await supabase.from("candidatos_experiencia").insert(expRows);
    if (expErr) throw new Error(`Falha ao inserir experiencias: ${expErr.message}`);
  }

  const tags = computeTags(expRows);

  let scorePosPersisted = null;
  if (dupId) {
    const { data: exAn } = await supabase
      .from("candidatos_analise")
      .select("score_pos_entrevista")
      .eq("candidato_id", dupId)
      .maybeSingle();
    scorePosPersisted = toNullableInt(exAn?.score_pos_entrevista);
  }

  const analise = extracted?.analise || {};
  const scoreIa = toNullableInt(analise.score_ia);
  const scorePosFromJson = toNullableInt(analise.score_pos_entrevista);
  const scorePosEff = scorePosFromJson ?? scorePosPersisted;
  const scoreFinal = computeScoreFinalFromIaEPos(scoreIa, scorePosEff);

  const fitRaw = analise.fit_food_service || '';
  const fitNormalized = ['Alto','Médio','Baixo'].find(v => fitRaw.startsWith(v)) || null;
  analise.fit_food_service = fitNormalized;

  const analisePayload = {
    candidato_id: candidatoId,
    perfil_resumo: toNullableString(analise.perfil_resumo),
    pontos_fortes: toNullableString(analise.pontos_fortes),
    red_flags: toNullableString(analise.red_flags),
    fit_food_service: toNullableString(analise.fit_food_service),
    analise_completa: toNullableString(analise.analise_completa),
    score_ia: scoreIa,
    score_final: scoreFinal,
    tags,
    ultima_experiencia: toNullableString(analise.ultima_experiencia),
    modelo_usado: "claude-sonnet-4-20250514",
    processado_em: new Date().toISOString(),
  };
  if (scorePosFromJson != null) analisePayload.score_pos_entrevista = scorePosFromJson;

  if (dupId) {
    const analiseUpdate = {
      perfil_resumo: analisePayload.perfil_resumo,
      pontos_fortes: analisePayload.pontos_fortes,
      red_flags: analisePayload.red_flags,
      fit_food_service: analisePayload.fit_food_service,
      analise_completa: analisePayload.analise_completa,
      score_ia: analisePayload.score_ia,
      score_final: analisePayload.score_final,
      tags: analisePayload.tags,
      ultima_experiencia: analisePayload.ultima_experiencia,
      modelo_usado: analisePayload.modelo_usado,
      processado_em: analisePayload.processado_em,
      atualizado_em: new Date().toISOString(),
    };
    if (scorePosFromJson != null) analiseUpdate.score_pos_entrevista = scorePosFromJson;
    const { data: analiseUpdated, error: anUpErr } = await supabase
      .from("candidatos_analise")
      .update(analiseUpdate)
      .eq("candidato_id", dupId)
      .select("id");
    if (anUpErr) throw new Error(`Falha ao atualizar analise: ${anUpErr.message}`);
    if (!analiseUpdated?.length) {
      const { error: anInsErr } = await supabase.from("candidatos_analise").insert(analisePayload);
      if (anInsErr) throw new Error(`Falha ao inserir analise: ${anInsErr.message}`);
    }

    console.log(` - updated: ${nome}`);
    return { status: "updated" };
  }

  const { error: anErr } = await supabase.from("candidatos_analise").insert(analisePayload);
  if (anErr) throw new Error(`Falha ao inserir analise: ${anErr.message}`);

  console.log(` - inserido com sucesso: ${nome}`);
  return { status: "inserted" };
}

async function main() {
  const gmailUser = requireEnv("GMAIL_USER");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_KEY");
  requireEnv("ANTHROPIC_API_KEY");

  const auth = await loadGoogleAuth();
  const gmail = google.gmail({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rootFolderId = await findOrCreateFolder(drive, DRIVE_ROOT_FOLDER);
  const monthFolderId = await findOrCreateFolder(drive, yearMonthNow(), rootFolderId);

  console.log("Buscando emails com PDF (últimos 30 dias)...");
  const messages = await listMessages(gmail, gmailUser);
  if (!messages.length) {
    console.log("Nenhum email encontrado.");
    return;
  }

  const total = Math.min(messages.length, MAX_EMAILS);
  console.log(`Total encontrados: ${messages.length}. Processando até ${total}.`);

  const stats = {
    inserted: 0,
    updated: 0,
    skipped_not_jobboard: 0,
    skipped_no_pdf: 0,
    skipped_empty_pdf: 0,
    skipped_no_name: 0,
    skipped_duplicate: 0,
    failed: 0,
  };

  for (let i = 0; i < total; i++) {
    const m = messages[i];
    try {
      const res = await processEmail({
        gmail,
        drive,
        anthropic,
        supabase,
        userId: gmailUser,
        rootFolderId,
        monthFolderId,
        messageId: m.id,
        idx: i + 1,
        total,
      });
      if (res && stats[res.status] != null) stats[res.status] += 1;
    } catch (e) {
      stats.failed += 1;
      console.error(` - erro no email ${m.id}:`, e.message || e);
    }
  }

  console.log("\nResumo final:");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exitCode = 1;
});

