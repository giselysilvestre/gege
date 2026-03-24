import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Porta do Express (igual a PORT no backend/.env, padrão 4000). */
const backendPort = process.env.GEGE_BACKEND_PORT ?? "4000";
const backendOrigin = `http://127.0.0.1:${backendPort}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Monorepo: evita aviso de múltiplos lockfiles na raiz `gege/`. */
  outputFileTracingRoot: path.join(__dirname, ".."),
  /**
   * Em desenvolvimento, o browser chama /gege-api/... no mesmo host do Next;
   * o Next encaminha para o Express. Assim não há CORS nem bloqueio entre portas.
   */
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/gege-api/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
