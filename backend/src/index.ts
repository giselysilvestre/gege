import "dotenv/config";
import cors from "cors";
import type { CorsOptions } from "cors";
import express from "express";
import { candidatosRouter } from "./routes/candidatos.js";

function corsOriginFromEnv(): CorsOptions["origin"] {
  const raw = process.env.CORS_ORIGIN?.trim();
  const dev = process.env.NODE_ENV !== "production";

  // Em desenvolvimento: aceita qualquer http://localhost:* e http://127.0.0.1:* (3000, 3001, 3002…)
  if (dev && (!raw || raw === "true" || raw === "*")) return true;
  if (dev && raw) {
    return (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const u = new URL(origin);
        if (
          u.protocol === "http:" &&
          (u.hostname === "localhost" || u.hostname === "127.0.0.1")
        ) {
          return callback(null, true);
        }
      } catch {
        /* ignore */
      }
      if (raw.includes(",")) {
        const list = raw.split(",").map((s) => s.trim());
        return callback(null, list.includes(origin));
      }
      return callback(null, origin === raw);
    };
  }

  if (!raw || raw === "true" || raw === "*") return true;
  if (raw.includes(",")) return raw.split(",").map((s) => s.trim());
  return raw;
}

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors({ origin: corsOriginFromEnv() }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "gege-backend" });
});

app.use("/api/candidatos", candidatosRouter);

app.listen(port, "0.0.0.0", () => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`Gegê API em http://127.0.0.1:${port} e http://localhost:${port}`);
  }
});
