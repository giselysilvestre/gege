import type { NextConfig } from "next";

/** Porta do Express (igual a PORT no backend/.env, padrão 4000). */
const backendPort = process.env.GEGE_BACKEND_PORT ?? "4000";
const backendOrigin = `http://127.0.0.1:${backendPort}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  /** Evita chunks quebrados (ENOENT em vendor-chunks/@supabase) no dev no Windows. */
  transpilePackages: ["@supabase/supabase-js", "@supabase/ssr"],
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
