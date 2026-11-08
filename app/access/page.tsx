"use client";

import { FormEvent, useState } from "react";
import { Atom, LockKeyhole, ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function AccessPage() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = params.get("setup") === "1";
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      const from = params.get("from");
      window.location.assign(from && from.startsWith("/") && !from.startsWith("//") ? from : "/");
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión."); }
    finally { setBusy(false); }
  }
  return <main className="access-shell"><section className="access-card"><div className="access-mark"><Atom size={26}/></div><span className="access-eyebrow">AVEROAI · POWERED BY VENICE AI</span><h1>Tu espacio de inteligencia.</h1><p>{setup ? "AveroAI todavía no está configurado. Añade los secretos de acceso en el servidor y vuelve a cargar esta página." : "Introduce tu código privado para continuar."}</p>{!setup&&<form onSubmit={submit}><label htmlFor="access-code"><LockKeyhole size={15}/> Código de acceso</label><input id="access-code" type="password" autoComplete="current-password" value={code} onChange={e=>setCode(e.target.value)} placeholder="Tu código privado" required/><button disabled={busy||!code}>{busy?"Verificando…":"Entrar"} <ArrowRight size={16}/></button>{error&&<div className="access-error">{error}</div>}</form>}<small>Acceso privado · Tus conversaciones se guardan en este dispositivo.</small></section></main>;
}
