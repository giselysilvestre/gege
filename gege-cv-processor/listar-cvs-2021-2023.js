require("dotenv").config();

const fs = require("node:fs");
const readline = require("node:readline");
const path = require("node:path");

/**
 * Gera um CSV a partir de lista-cvs.csv (mesmos critérios Indeed + PDF do export),
 * filtrando só por data em data_recebimento.
 *
 * Importante:
 * - O Gmail/lista mestre, na prática, pode não ter 2021/2022/no arquivo — só o que
 *   existir em lista-cvs.csv entra no recorte.
 * - Se o fim for 12/12/2023, ficam de fora todos os e-mails de 13–31/12/2023
 *   que estão no mestre (centenas). Por isso o fim padrão aqui é 31/12/2023.
 */

const INPUT_CSV_PATH = path.join(__dirname, "lista-cvs.csv");
const OUTPUT_CSV_PATH = path.join(__dirname, "lista-cvs-2021-ate-2023-12-31.csv");

const RANGE_START = new Date(2021, 0, 1, 0, 0, 0, 0);
const RANGE_END = new Date(2023, 11, 31, 23, 59, 59, 999);

function parseDataRecebimentoBr(s) {
  const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0, 0);
}

function isWithinRangeBr(dataRecebimentoBr) {
  const t = parseDataRecebimentoBr(dataRecebimentoBr);
  if (!t || Number.isNaN(t.getTime())) return false;
  return t >= RANGE_START && t <= RANGE_END;
}

/** Parser minimalista para linhas no formato "a","b","c","d" */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  await fs.promises.access(INPUT_CSV_PATH, fs.constants.R_OK);

  const out = fs.createWriteStream(OUTPUT_CSV_PATH, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_CSV_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  let headerLine = "";
  let kept = 0;
  let totalDataRows = 0;

  for await (const line of rl) {
    lineNo += 1;
    if (lineNo === 1) {
      headerLine = line;
      out.write(`${headerLine}\n`);
      continue;
    }
    if (!line.trim()) continue;
    totalDataRows += 1;
    const cols = parseCsvLine(line);
    if (cols.length < 4) continue;
    const dataRecebimento = cols[1];
    if (!isWithinRangeBr(dataRecebimento)) continue;
    out.write(`${line}\n`);
    kept += 1;
  }

  out.end();

  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });

  console.log(`Período filtrado: 01/01/2021 a 31/12/2023 (inclusive, pela coluna data_recebimento)`);
  console.log(`Arquivo de entrada: ${INPUT_CSV_PATH}`);
  console.log(`Linhas de dados no mestre (sem cabeçalho): ${totalDataRows}`);
  console.log(`Linhas exportadas neste período: ${kept}`);
  console.log(`CSV gerado em: ${OUTPUT_CSV_PATH}`);
  console.log(
    `Nota: em lista-cvs.csv costuma não haver linhas de 2021/2022; só o que o export do Gmail trouxe.`
  );
}

main().catch((err) => {
  console.error("Erro:", err.message || err);
  process.exitCode = 1;
});
