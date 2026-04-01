require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { google } = require("googleapis");

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");
const OUTPUT_CSV_PATH = path.join(__dirname, "lista-cvs-todos.csv");

const GMAIL_USER = process.env.GMAIL_USER || "me";
const QUERY = "has:attachment filename:pdf";

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
      maxResults: 500,
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

async function loadRows(gmail, messages) {
  const rows = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const msg = await gmail.users.messages.get({
      userId: GMAIL_USER,
      id: message.id,
      format: "metadata",
      metadataHeaders: ["Subject", "Date"],
    });

    const headers = msg.data.payload?.headers || [];
    const subject = headerValue(headers, "Subject");
    const dateHeader = headerValue(headers, "Date");
    const internalDate = msg.data.internalDate ? Number(msg.data.internalDate) : null;
    const dateSource = internalDate ? new Date(internalDate) : dateHeader;

    rows.push({
      message_id: message.id || "",
      data_recebimento: formatDateBr(dateSource),
      assunto: subject,
      status: "pendente",
    });

    if ((i + 1) % 500 === 0) {
      console.log(`Processados ${i + 1} de ${messages.length} emails...`);
    }
  }

  return rows;
}

async function writeCsv(rows) {
  const header = ["message_id", "data_recebimento", "assunto", "status"];
  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.message_id),
        csvEscape(row.data_recebimento),
        csvEscape(row.assunto),
        csvEscape(row.status),
      ].join(",")
    );
  }

  await fs.writeFile(OUTPUT_CSV_PATH, lines.join("\n"), "utf8");
}

async function main() {
  const gmail = await createGmailClient();
  const messages = await listAllMessageIds(gmail);
  console.log(`Total de emails encontrados: ${messages.length}`);

  const rows = await loadRows(gmail, messages);
  await writeCsv(rows);

  console.log(`CSV gerado em: ${OUTPUT_CSV_PATH}`);
}

main().catch((err) => {
  console.error("Erro ao listar CVs:", err.message || err);
  process.exitCode = 1;
});

