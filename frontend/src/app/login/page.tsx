"use client";

import Image from "next/image";
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
    let redirecting = false;
    try {
      const supabase = getSupabaseBrowserClient();
      // Sem isso, o cookie/sessão do usuário anterior pode continuar ativo e o painel mostra o nome errado.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      const normalizedEmail = email.trim().toLowerCase();
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: senha,
      });
      if (signInError) throw signInError;
      if (!authData?.session) throw new Error("Sessão não foi criada.");
      const { data: check, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      if (!check.session) throw new Error("Não foi possível gravar o login. Tente limpar cookies.");
      redirecting = true;
      await new Promise((r) => setTimeout(r, 0));
      window.location.assign(`${window.location.origin}${safeNextPath()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar");
    } finally {
      if (!redirecting) setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <Image
        src="/branding/logo-gege-wordmark-light.png"
        alt="gegê"
        width={280}
        height={84}
        priority
        className="login-logo-wordmark"
      />
      <p className="login-tagline">monte sua equipe!</p>

      <form className="login-card" onSubmit={onSubmit} autoComplete="on" method="post">
        <h2>Entrar</h2>
        <p className="login-lead">Acesse com seu email</p>

        <div className="login-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="username"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="login-field" style={{ marginBottom: 8 }}>
          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            name="password"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>
        <input
          type="text"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
            margin: 0,
            border: 0,
            padding: 0,
          }}
        />

        <button type="submit" className="login-submit" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
        <p className="login-forgot-wrap">
          <button type="button" className="login-forgot">
            Esqueceu a senha?
          </button>
        </p>
        {error ? <p className="login-error">{error}</p> : null}
      </form>
    </main>
  );
}
