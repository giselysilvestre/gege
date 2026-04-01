/**
 * Windows: encerra o processo que está escutando na porta 3000 (evita .next travado / EPERM).
 * Uso: node scripts/kill-port-3000.cjs
 */
const { execSync } = require("child_process");

function main() {
  if (process.platform !== "win32") {
    console.log("kill-port-3000: só necessário no Windows; ignorando.");
    return;
  }
  let out = "";
  try {
    out = execSync("netstat -ano", { encoding: "utf8" });
  } catch {
    console.warn("kill-port-3000: netstat falhou");
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(":3000")) continue;
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
      console.log(`kill-port-3000: encerrado PID ${pid}`);
    } catch {
      /* já morreu ou sem permissão */
    }
  }
  if (pids.size === 0) console.log("kill-port-3000: nenhum processo em LISTEN na porta 3000");
}

main();
