require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { google } = require("googleapis");
const pdfParse = require('pdf-parse');
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");
const { analyzeCvWithClaude, getCvAnalysisModelLabel } = require("./prompt-cv-gege");
const { normalizeIsoDateField } = require("./cv-normalize");
const {
  sha256Buffer,
  loadProcessedShaSets,
  classifyPdfBySha,
  isGmailMessageAlreadyAnalyzed,
} = require("./cv-dedup");
const { computeScoreFinal } = require("../shared/score-final");

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
  return analyzeCvWithClaude(anthropic, cvText, { logCacheUsage: true });
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

async function processEmail({ gmail, drive, anthropic, supabase, userId, rootFolderId, monthFolderId, messageId, idx, total, cacheSha, seenThisRun }) {
  console.log(`\n[${idx}/${total}] Processando email ${messageId}...`);

  if (await isGmailMessageAlreadyAnalyzed(supabase, messageId)) {
    console.log(" - email já analisado no Supabase, pulando.");
    return { status: "skipped_already_analyzed" };
  }

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
  const sha = sha256Buffer(pdfBuffer);
  const dedup = await classifyPdfBySha({ supabase, sha, cacheSha, seenThisRun });
  if (dedup.status === "filtro1_cache") {
    console.log(" - filtro1 (cache local), pulando.");
    return { status: "skipped_cache" };
  }
  if (dedup.status === "filtro2_supabase") {
    console.log(" - filtro2 (PDF já no Supabase), pulando.");
    return { status: "skipped_supabase" };
  }
  if (dedup.status === "duplicata_mesma_execucao") {
    console.log(" - duplicata na mesma execução, pulando.");
    return { status: "skipped_duplicate" };
  }

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

  const temLocalizacao =
    toNullableString(cand.cidade) ||
    toNullableString(cand.bairro) ||
    toNullableString(cand.cep);

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
    data_nascimento: normalizeIsoDateField(cand.data_nascimento),
    situacao_emprego: toNullableString(cand.situacao_emprego),
    origem,
    curriculo_url: curriculoUrl,
    gmail_message_id: messageId,
  };

  const dupId = await findDuplicateCandidatoId(supabase, telefone, email);
  let candidatoId;

  if (dupId) {
    if (temLocalizacao) {
      const { data: existente } = await supabase
        .from("candidatos")
        .select("localizacao_fonte")
        .eq("id", dupId)
        .maybeSingle();
      if (existente?.localizacao_fonte !== "whatsapp_conversa") {
        candidatoPayload.localizacao_fonte = "cv";
      }
    }
    const { error: upErr } = await supabase.from("candidatos").update(candidatoPayload).eq("id", dupId);
    if (upErr) throw new Error(`Falha ao atualizar candidato: ${upErr.message}`);

    const { error: delErr } = await supabase.from("candidatos_experiencia").delete().eq("candidato_id", dupId);
    if (delErr) throw new Error(`Falha ao remover experiencias: ${delErr.message}`);

    candidatoId = dupId;
  } else {
    if (temLocalizacao) candidatoPayload.localizacao_fonte = "cv";
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
      data_inicio: normalizeIsoDateField(e?.data_inicio),
      data_fim: normalizeIsoDateField(e?.data_fim),
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
  const scoreFinal = computeScoreFinal(scoreIa, scorePosEff);

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
    modelo_usado: getCvAnalysisModelLabel(),
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
    skipped_already_analyzed: 0,
    skipped_cache: 0,
    skipped_supabase: 0,
    failed: 0,
  };

  const cacheSha = loadProcessedShaSets();
  const seenThisRun = new Set();

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
        cacheSha,
        seenThisRun,
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

