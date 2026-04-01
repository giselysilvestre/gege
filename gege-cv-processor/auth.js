require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { createInterface } = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { google } = require("googleapis");

process.chdir(__dirname);

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];

function getOAuthConfig(credentials) {
  const cfg = credentials.installed || credentials.web;
  if (!cfg) throw new Error("credentials.json inválido: esperado bloco 'installed' ou 'web'.");
  return cfg;
}

async function createOAuthClient() {
  const raw = await fs.readFile(CREDENTIALS_PATH, "utf8");
  const credentials = JSON.parse(raw);
  const cfg = getOAuthConfig(credentials);
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, cfg.redirect_uris[0]);
}

async function main() {
  const oAuth2Client = await createOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n1) Abra este link no navegador:");
  console.log(authUrl);
  console.log("\n2) Faça login com a conta Gmail e cole o código aqui.");

  const rl = createInterface({ input, output });
  const code = (await rl.question("Código OAuth: ")).trim();
  rl.close();

  if (!code) throw new Error("Código OAuth vazio.");

  const { tokens } = await oAuth2Client.getToken(code);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");

  console.log(`\nToken salvo em: ${TOKEN_PATH}`);
  console.log("Autenticação concluída. Agora rode: node processor.js");
}

main().catch((err) => {
  console.error("Falha na autenticação OAuth:", err.message || err);
  process.exitCode = 1;
});

