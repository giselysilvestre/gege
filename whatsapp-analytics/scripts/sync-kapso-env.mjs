/**
 * Copia KAPSO_API_KEY e KAPSO_PHONE_NUMBER_ID de whatsapp-bot/.env
 * para whatsapp-analytics/.env.local
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const botEnv = fs.readFileSync(path.join(root, "whatsapp-bot/.env"), "utf8");
const pick = (k) => {
  const m = botEnv.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
};
const key = pick("KAPSO_API_KEY");
const phone = pick("KAPSO_PHONE_NUMBER_ID");
if (!key || !phone) {
  console.error("Kapso não encontrado em whatsapp-bot/.env");
  process.exit(1);
}
const target = path.join(root, "whatsapp-analytics/.env.local");
let text = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
for (const [k, v] of [
  ["KAPSO_API_KEY", key],
  ["KAPSO_PHONE_NUMBER_ID", phone],
]) {
  if (new RegExp(`^${k}=`, "m").test(text)) {
    text = text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
  } else {
    text = `${text.trimEnd()}\n${k}=${v}\n`;
  }
}
fs.writeFileSync(target, text);
console.log("Ok — reinicie: cd whatsapp-analytics && npm run dev");
