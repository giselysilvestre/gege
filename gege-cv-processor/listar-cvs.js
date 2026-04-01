require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { google } = require("googleapis");

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");
const OUTPUT_CSV_PATH = path.join(__dirname, "lista-cvs.csv");

const GMAIL_USER = process.env.GMAIL_USER || "me";
// Gmail query date operators are not strictly intuitive; we still post-filter below.
const QUERY = "has:attachment filename:pdf from:@indeedemail.com after:2021/12/26 before:2023/01/02";

const RANGE_START = new Date(2021, 11, 27, 0, 0, 0, 0); // 27/12/2021
const RANGE_END = new Date(2023, 0, 1, 23, 59, 59, 999); // 01/01/2023

function csvEscape(value) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function formatDateBr(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function parseDateBr(value) {
  const m = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0, 0);
}

function isWithinRangeBr(dataRecebimento) {
  const d = parseDateBr(dataRecebimento);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d >= RANGE_START && d <= RANGE_END;
}

function getOauthConfig(credentials) {
  const cfg = credentials.installed || credentials.web;
  if (!cfg) throw new Error("credentials.json inválido: esperado bloco 'installed' ou 'web'.");
  return cfg;
}

async function createGmailClient() {
  const [credentialsRaw, tokenRaw] = await Promise.all([
    fs.readFile(CREDENTIALS_PATH, "utf8"),
    fs.readFile(TOKEN_PATH, "utf8"),
  ]);
  const credentials = JSON.parse(credentialsRaw);
  const token = JSON.parse(tokenRaw);
  const cfg = getOauthConfig(credentials);

  const auth = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, cfg.redirect_uris[0]);
  auth.setCredentials(token);
  return google.gmail({ version: "v1", auth });
}

async function listAllMessageIds(gmail) {
  const all = [];
  let pageToken = undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: GMAIL_USER,
      q: QUERY,
      pageToken,
    });

    const messages = res.data.messages || [];
    all.push(...messages);
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return all;
}

function headerValue(headers, name) {
  const hit = (headers || []).find((h) => String(h.name || "").toLowerCase() === name.toLowerCase());
  return hit ? String(hit.value || "") : "";
}

function collectPdfNames(part, out) {
  if (!part) return;
  const filename = String(part.filename || "").trim();
  if (filename && filename.toLowerCase().endsWith(".pdf")) {
    out.push(filename);
  }
  for (const child of part.parts || []) {
    collectPdfNames(child, out);
  }
}

async function loadRows(gmail, messages) {
  const rows = [];

  for (const message of messages) {
    const msg = await gmail.users.messages.get({
      userId: GMAIL_USER,
      id: message.id,
      format: "full",
    });

    const headers = msg.data.payload?.headers || [];
    const assunto = headerValue(headers, "Subject");
    const remetente = headerValue(headers, "From");
    const dateHeader = headerValue(headers, "Date");
    const internalDate = msg.data.internalDate ? Number(msg.data.internalDate) : null;
    const dateSource = internalDate ? new Date(internalDate) : dateHeader;
    const dataRecebimento = formatDateBr(dateSource);

    if (!isWithinRangeBr(dataRecebimento)) continue;

    const pdfNames = [];
    collectPdfNames(msg.data.payload, pdfNames);
    if (!pdfNames.length) continue;

    const nomeArquivoPdf = pdfNames.join(" | ");

    rows.push({
      message_id: message.id || "",
      data_recebimento: dataRecebimento,
      remetente,
      assunto,
      nome_arquivo_pdf: nomeArquivoPdf,
      status: "pendente",
    });
  }

  return rows;
}

async function writeCsv(rows) {
  const header = ["message_id", "data_recebimento", "remetente", "assunto", "nome_arquivo_pdf", "status"];
  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.message_id),
        csvEscape(row.data_recebimento),
        csvEscape(row.remetente),
        csvEscape(row.assunto),
        csvEscape(row.nome_arquivo_pdf),
        csvEscape(row.status),
      ].join(",")
    );
  }

  await fs.writeFile(OUTPUT_CSV_PATH, lines.join("\n"), "utf8");
}

async function main() {
  const gmail = await createGmailClient();
  const messages = await listAllMessageIds(gmail);
  const rows = await loadRows(gmail, messages);
  await writeCsv(rows);

  console.log(`Total de emails encontrados: ${rows.length}`);
  console.log(`CSV gerado em: ${OUTPUT_CSV_PATH}`);
}

main().catch((err) => {
  console.error("Erro ao listar CVs:", err.message || err);
  process.exitCode = 1;
});

