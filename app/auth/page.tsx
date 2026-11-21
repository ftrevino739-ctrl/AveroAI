"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import "./auth.css";

type Account = { id: string; email: string };
type RequestUsage = {
  policyVersion: string;
  usedRequests: number;
  maxRequests: number;
  remainingRequests: number;
  periodStartsAt: string;
  periodEndsAt: string;
};

function readCookie(name: string): string {
  const prefix = name + "=";
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [usage, setUsage] = useState<RequestUsage | null>(null);
  const [usageConfigured, setUsageConfigured] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  useEffect(() => {
    let active = true;
    const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const magicToken = new URLSearchParams(fragment).get("aveiro_magic");
    if (magicToken) setToken(magicToken);

    // The token remains in the URL fragment: it is not sent in the initial HTTP request.
    if (fragment) window.history.replaceState(null, "", window.location.pathname + window.location.search);

    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active || !response.ok) return;
        const data = await response.json();
        if (data.authenticated && data.user) setAccount(data.user as Account);
      })
      .catch(() => {})
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!account) {
      setUsage(null);
      setUsageConfigured(false);
      setUsageError("");
      return;
    }
    let active = true;
    setUsageLoading(true);
    setUsageError("");
    fetch("/api/account/usage", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "No se pudo consultar el uso.");
        if (!active) return;
        setUsageConfigured(Boolean(data.configured));
        setUsage(data.requests || null);
      })
      .catch((reason) => {
        if (active) setUsageError(reason instanceof Error ? reason.message : "No se pudo consultar el uso.");
      })
      .finally(() => { if (active) setUsageLoading(false); });
    return () => { active = false; };
  }, [account]);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "No se pudo solicitar el enlace.");
      setNotice(data.message || "Revisa tu correo para continuar.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo solicitar el enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyLink() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "El enlace no es válido o ha caducado.");
      setAccount(data.user as Account);
      setToken("");
      router.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const csrf = readCookie("__Host-aveiro_csrf");
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrf ? { "X-Aveiro-CSRF": csrf } : {}
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo cerrar la sesión.");
      }
      setAccount(null);
      setNotice("Has cerrado tu sesión.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cerrar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <a className="auth-brand" href="/">✳ <span>avero<span>ai</span></span></a>
        <div className="auth-kicker">TU ESPACIO DE INTELIGENCIA</div>
        <h1>Accede a <em>AveiroAI.</em></h1>
        <p className="auth-lead">Entra desde tu navegador. No necesitas instalar nada ni aportar API keys personales.</p>

        {checking ? <div className="auth-muted">Comprobando tu sesión…</div> : account ? (
          <div className="auth-account">
            <div className="auth-status-dot" />
            <div><strong>Sesión activa</strong><span>{account.email}</span></div>
            <button type="button" onClick={logout} disabled={busy}>{busy ? "Cerrando…" : "Cerrar sesión"}</button>
            <a className="auth-primary" href="/">Volver al chat</a>
            <section className="auth-usage">
              <div className="auth-usage-heading">
                <strong>Uso mensual</strong>
                <span>{usageLoading ? "Actualizando…" : usageConfigured && usage ? `${usage.remainingRequests} restantes` : "Cuenta"}</span>
              </div>
              {usageLoading ? <p className="auth-usage-muted">Consultando tu límite de solicitudes…</p> :
                usageError ? <p className="auth-usage-muted">{usageError}</p> :
                usageConfigured && usage ? (
                  <>
                    <div className="auth-usage-count">
                      <strong>{usage.usedRequests}</strong>
                      <span>de {usage.maxRequests} solicitudes</span>
                    </div>
                    <div className="auth-usage-track">
                      <i style={{ width: `${Math.min(100, Math.round(usage.usedRequests / Math.max(1, usage.maxRequests) * 100))}%` }} />
                    </div>
                    <small>El periodo se renueva el {new Date(usage.periodEndsAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}.</small>
                  </>
                ) : (
                  <p className="auth-usage-muted">El límite mensual aún no está configurado. El chat permanecerá bloqueado hasta establecer un tope finito.</p>
                )}
              <p className="auth-usage-footnote">La medición fiable de tokens y los créditos están deshabilitados; no se realizan cargos estimados.</p>
            </section>
          </div>
        ) : token ? (
          <div className="auth-verify">
            <div className="auth-lock">✳</div>
            <h2>Confirma tu acceso</h2>
            <p>El enlace se consumirá una sola vez al continuar. Por seguridad, abrir esta página no inicia sesión automáticamente.</p>
            <button className="auth-primary" type="button" onClick={verifyLink} disabled={busy}>
              {busy ? "Verificando…" : "Continuar a AveiroAI"}
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={requestLink}>
            <label htmlFor="auth-email">Correo electrónico</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@correo.com"
            />
            <button className="auth-primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Enviando…" : "Enviar enlace de acceso"}
            </button>
            <small>Te enviaremos un enlace de un solo uso con 15 minutos de validez.</small>
          </form>
        )}

        {notice && <div className="auth-notice" role="status">{notice}</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="auth-footer">
          <span>Liquid Glass · Multimodelo · Nodos remotos</span>
          <a href="/">Volver al inicio</a>
        </div>
      </section>
      <div className="auth-bottom">Las conversaciones permanecen en este dispositivo hasta que se diseñe y active una sincronización de nube independiente.</div>
    </main>
  );
}
