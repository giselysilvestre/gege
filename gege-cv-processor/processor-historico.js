require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { google } = require("googleapis");
const pdfParse = require("pdf-parse");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

process.chdir(__dirname);

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

const SPREADSHEET_ID = "1gDk2r9PvBl0PVdqG8pMFyoY_xfw7501cB9a7RCR5Uic";
const SHEET_NAME = "lista-cvs";

/** A=message_id, B=data_recebimento (DD/MM/AAAA), C=assunto, D=status (pendente|uploaded|erro|skipped) */
const COL_MESSAGE_ID = 0;
const COL_DATA = 1;
const COL_STATUS = 3;

const BATCH_SIZE = 3;
const DRIVE_ROOT_FOLDER = "Gegê CVs";

const JOB_BOARD_DOMAINS = ["indeedemail.com", "vagas.com", "catho.com.br", "infojobs.com.br", "sine.com.br"];

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Defina ${name} no arquivo .env`);
  return String(v).trim();
}

function parseYearMonthArg(arg) {
  const m = String(arg || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error("Uso: node processor-historico.js YYYY-MM  (ex: 2025-01)");
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error("Mês inválido em YYYY-MM.");
  return { year, month, label: `${year}-${String(month).padStart(2, "0")}` };
}

function parseDateBr(value) {
  const s = String(value || "").trim();
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowMatchesMonth(row, year, month) {
  const cell = row[COL_DATA];
  const d = parseDateBr(cell);
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function rowStatusPendente(row) {
  const statusAtual = row[COL_STATUS]?.toLowerCase().trim();
  return statusAtual === 'pendente' || statusAtual === 'erro';
}

function isHeaderRow(row) {
  const a = String(row?.[COL_MESSAGE_ID] ?? "").trim().toLowerCase();
  return a === "message_id" || a.includes("message");
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
    return data && data.text ? data.text.trim() : "";
  } catch {
    return "";
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
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

async function findExistingCandidatoId(supabase, { messageId, telefone, email }) {
  const { data: byGmail, error: errGmail } = await supabase
    .from("candidatos")
    .select("id")
    .eq("gmail_message_id", messageId)
    .maybeSingle();
  if (errGmail) throw errGmail;
  if (byGmail?.id) return { id: byGmail.id, match: "gmail_message_id" };

  if (telefone) {
    const { data, error } = await supabase.from("candidatos").select("id").eq("telefone", telefone).maybeSingle();
    if (error) throw error;
    if (data?.id) return { id: data.id, match: "telefone" };
  }
  if (email) {
    const { data, error } = await supabase.from("candidatos").select("id").eq("email", email).maybeSingle();
    if (error) throw error;
    if (data?.id) return { id: data.id, match: "email" };
  }
  return { id: null, match: null };
}

async function updateSheetResult(sheets, sheetRow1Based, value) {
  const range = `${SHEET_NAME}!D${sheetRow1Based}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

async function processMessageToSupabase({
  gmail,
  drive,
  anthropic,
  supabase,
  userId,
  monthFolderId,
  messageId,
}) {
  const { message, pdfParts } = await getMessageAndPdfParts(gmail, userId, messageId);
  const fromHeader = getHeader(message.payload?.headers, "from");
  const domain = domainFromFromHeader(fromHeader);

  if (!isJobBoardDomain(domain)) {
    return { sheet: "skipped", detail: "not_jobboard" };
  }
  if (!pdfParts.length) {
    return { sheet: "skipped", detail: "no_pdf" };
  }

  const pdf = pdfParts[0];
  const pdfBuffer = await downloadAttachment(gmail, userId, messageId, pdf.attachmentId);
  const text = await extractPdfText(pdfBuffer);
  if (!text) {
    return { sheet: "skipped", detail: "empty_pdf" };
  }

  const extracted = await callClaude(anthropic, text);
  const cand = extracted?.candidato || {};
  const nome = normalizeNomeComPreposicoes(cand.nome);
  if (!nome) {
    return { sheet: "skipped", detail: "no_name" };
  }

  const telefone = normalizeTelefoneStrict(cand.telefone);
  const email = normalizeEmail(cand.email);
  const origem = origemFromDomain(domain);

  const safeName = sanitizeFileNamePart(nome) || "candidato";
  const fileName = `${safeName}_${messageId}.pdf`;
  const curriculoUrl = await uploadPdfToDrivePublic(drive, pdfBuffer, monthFolderId, fileName);

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

  const { id: existingId, match: updateMatch } = await findExistingCandidatoId(supabase, { messageId, telefone, email });
  let candidatoId;

  if (existingId) {
    const { error: upErr } = await supabase.from("candidatos").update(candidatoPayload).eq("id", existingId);
    if (upErr) throw new Error(`Falha ao atualizar candidato: ${upErr.message}`);

    const { error: delErr } = await supabase.from("candidatos_experiencia").delete().eq("candidato_id", existingId);
    if (delErr) throw new Error(`Falha ao remover experiencias: ${delErr.message}`);

    candidatoId = existingId;
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
  if (existingId) {
    const { data: exAn } = await supabase
      .from("candidatos_analise")
      .select("score_pos_entrevista")
      .eq("candidato_id", existingId)
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

  if (existingId) {
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
      .eq("candidato_id", existingId)
      .select("id");
    if (anUpErr) throw new Error(`Falha ao atualizar analise: ${anUpErr.message}`);
    if (!analiseUpdated?.length) {
      const { error: anInsErr } = await supabase.from("candidatos_analise").insert(analisePayload);
      if (anInsErr) throw new Error(`Falha ao inserir analise: ${anInsErr.message}`);
    }
    return { sheet: "uploaded", db: "updated", updateReason: updateMatch };
  }

  const { error: anErr } = await supabase.from("candidatos_analise").insert(analisePayload);
  if (anErr) throw new Error(`Falha ao inserir analise: ${anErr.message}`);
  return { sheet: "uploaded", db: "inserted" };
}

async function main() {
  const { year, month, label } = parseYearMonthArg(process.argv[2]);

  const gmailUser = requireEnv("GMAIL_USER");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_KEY");
  requireEnv("ANTHROPIC_API_KEY");

  const auth = await loadGoogleAuth();
  const gmail = google.gmail({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rootFolderId = await findOrCreateFolder(drive, DRIVE_ROOT_FOLDER);
  const monthFolderId = await findOrCreateFolder(drive, label, rootFolderId);

  const valuesRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
  });
  const rows = valuesRes.data.values || [];

  const tasks = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    if (i === 0 && isHeaderRow(row)) continue;

    if (!rowMatchesMonth(row, year, month)) continue;
    if (!rowStatusPendente(row)) continue;

    const messageId = String(row[COL_MESSAGE_ID] ?? "").trim();
    if (!messageId) continue;

    tasks.push({ messageId, sheetRow1Based: i + 1 });
  }

  const stats = { inserted: 0, updated: 0, skipped: 0, erro: 0, total: tasks.length };

  if (!tasks.length) {
    console.log(`Nenhuma linha pendente em ${label} (aba ${SHEET_NAME}).`);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`${tasks.length} linha(s) pendente(s) para ${label}. Processando em lotes de ${BATCH_SIZE}...`);

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const chunk = tasks.slice(i, i + BATCH_SIZE);
    const outcomes = await Promise.all(
      chunk.map(async ({ messageId, sheetRow1Based }) => {
        try {
          const res = await processMessageToSupabase({
            gmail,
            drive,
            anthropic,
            supabase,
            userId: gmailUser,
            monthFolderId,
            messageId,
          });

          await updateSheetResult(sheets, sheetRow1Based, res.sheet);

          if (res.sheet === "skipped") {
            console.log(` - skipped ${messageId} (${res.detail})`);
            return { kind: "skipped" };
          }
          if (res.db === "updated") {
            console.log(` - updated (${res.updateReason}) ${messageId}`);
            return { kind: "updated" };
          }
          console.log(` - inserted ${messageId}`);
          return { kind: "inserted" };
        } catch (e) {
          const msg = e.message || String(e);
          console.error(` - erro ${messageId}:`, msg);
          try {
            await updateSheetResult(sheets, sheetRow1Based, "erro");
          } catch (sheetErr) {
            console.error(` - falha ao gravar planilha linha ${sheetRow1Based}:`, sheetErr.message || sheetErr);
          }
          return { kind: "erro" };
        }
      })
    );

    for (const o of outcomes) {
      if (o.kind === "skipped") stats.skipped += 1;
      else if (o.kind === "updated") stats.updated += 1;
      else if (o.kind === "inserted") stats.inserted += 1;
      else if (o.kind === "erro") stats.erro += 1;
    }
  }

  console.log("\nResumo final:");
  console.log(
    JSON.stringify(
      {
        inserted: stats.inserted,
        updated: stats.updated,
        skipped: stats.skipped,
        erro: stats.erro,
        total: stats.total,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exitCode = 1;
});
