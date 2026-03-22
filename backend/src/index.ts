import "dotenv/config";
import cors from "cors";
import express from "express";
import { candidatosRouter } from "./routes/candidatos.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "gege-backend" });
});

app.use("/api/candidatos", candidatosRouter);

app.listen(port, () => {
  console.log(`Gegê API em http://localhost:${port}`);
});
