"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNextPath(): string {
  const next = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (signInError) throw signInError;

      if (!authData?.session) {
        throw new Error(
          "Sessão não foi criada. Se o e-mail precisa ser confirmado, abra o link enviado pelo Supabase ou desative a confirmação em Authentication > Providers > Email."
        );
      }

      const { data: check } = await supabase.auth.getSession();
      if (!check.session) {
        throw new Error("Não foi possível gravar o login neste navegador. Tente limpar cookies do site ou outro navegador.");
      }

      await new Promise((r) => setTimeout(r, 100));
      window.location.replace(`${window.location.origin}${safeNextPath()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        padding: "48px 16px 40px",
        background: "#F9FAFB",
      }}
    >
      <div
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: "360px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ marginBottom: "32px" }}>
          <img
            src="/branding/logo-gege.png"
            alt="Gegê"
            width={160}
            height={48}
            style={{ height: "48px", width: "auto", maxWidth: "200px", objectFit: "contain", display: "block" }}
          />
        </div>
        <p style={{ marginBottom: "32px", textAlign: "center", fontSize: "14px", fontWeight: 500, color: "#667085" }}>
          Painel do recrutador
        </p>

        <form
          onSubmit={onSubmit}
          style={{
            width: "100%",
            borderRadius: "16px",
            border: "1px solid #EAECF0",
            background: "#fff",
            padding: "32px",
          }}
        >
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="login-email" style={{ marginBottom: "8px", display: "block", fontSize: "12px", fontWeight: 600, color: "#101828" }}>
              Email
            </label>
            <input
              id="login-email"
              className="gege-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label htmlFor="login-senha" style={{ marginBottom: "8px", display: "block", fontSize: "12px", fontWeight: 600, color: "#101828" }}>
              Senha
            </label>
            <input
              id="login-senha"
              className="gege-input"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>
          <button className="gege-btn-primary" disabled={loading} type="submit">
            {loading ? "Entrando…" : "Entrar"}
          </button>
          {error ? (
            <p style={{ marginTop: "16px", textAlign: "center", fontSize: "13px", fontWeight: 500, color: "#B42318" }} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
