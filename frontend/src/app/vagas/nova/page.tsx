"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { toSlug } from "@/lib/slug";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function NovaVagaPage() {
  const [cargo, setCargo] = useState("");
  const [salario, setSalario] = useState("");
  const [escala, setEscala] = useState("6x1");
  const [horario, setHorario] = useState("");
  const [beneficios, setBeneficios] = useState("");
  const [cep, setCep] = useState("");
  const [descricao, setDescricao] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function publicar() {
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        throw new Error("Sessão expirada. Faça login de novo.");
      }

      const slug = `${toSlug(cargo)}-${Date.now()}`;
      const createRes = await fetch("/api/vagas/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ cargo, salario, escala, horario, beneficios, cep, descricao, slug }),
      });
      const payload = (await createRes.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!createRes.ok) {
        throw new Error(payload.message || "Não foi possível criar a vaga");
      }
      const id = payload.id;
      if (!id) throw new Error("Resposta da API sem id da vaga");
      const matchRes = await fetch(`/api/vagas/${id}/match`, { method: "POST", credentials: "include" });
      if (!matchRes.ok) {
        const m = (await matchRes.json().catch(() => ({}))) as { message?: string };
        console.warn("[vagas/nova] match:", m.message ?? matchRes.status);
      }
      router.push(`/vagas/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar vaga");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "80px" }}>
      <div
        style={{
          background: "#fff",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          borderBottom: "1px solid #EAECF0",
        }}
      >
        <Link
          href="/vagas"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "#F9FAFB",
            border: "1px solid #EAECF0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={18} color="#344054" />
        </Link>
        <span style={{ fontSize: "16px", fontWeight: 700, color: "#101828" }}>Nova vaga</span>
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
            Cargo *
          </label>
          <input className="gege-input" value={cargo} onChange={(e) => setCargo(e.target.value)} required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
              Salário
            </label>
            <input className="gege-input" value={salario} onChange={(e) => setSalario(e.target.value)} placeholder="1600" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
              Escala
            </label>
            <select className="gege-input" value={escala} onChange={(e) => setEscala(e.target.value)}>
              <option>6x1</option>
              <option>5x2</option>
              <option>4x3</option>
              <option>12x36</option>
              <option>Outro</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
            Horário
          </label>
          <input className="gege-input" value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ex.: 12h às 20h" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
            Benefícios
          </label>
          <input className="gege-input" value={beneficios} onChange={(e) => setBeneficios(e.target.value)} placeholder="VT, VR…" />
        </div>
        <div style={{ borderTop: "1px solid #EAECF0", paddingTop: "14px" }}>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
            CEP da loja *
          </label>
          <input className="gege-input" value={cep} onChange={(e) => setCep(e.target.value)} required />
          <p className="mt-1 text-[11px]" style={{ color: "#667085" }}>
            Usado para calcular distância dos candidatos
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#101828" }}>
            Descrição
          </label>
          <textarea className="gege-input min-h-[88px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <button className="gege-btn-primary" type="button" disabled={loading || !cargo.trim() || !cep.trim()} onClick={() => void publicar()}>
          {loading ? "Publicando…" : "Publicar vaga e buscar candidatos"}
        </button>
        {error ? (
          <p style={{ fontSize: "13px", color: "#991b1b" }} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <BottomNav />
    </div>
  );
}
