import nodemailer from "nodemailer";
import { getCanonicalAuthOrigin } from "./auth-security";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = env.AVEIRO_SMTP_HOST?.trim() || "";
  const portValue = env.AVEIRO_SMTP_PORT?.trim() || "587";
  const user = env.AVEIRO_SMTP_USER || "";
  const pass = env.AVEIRO_SMTP_PASS || "";
  const from = env.AVEIRO_SMTP_FROM?.trim() || "";
  const port = Number(portValue);

  if (
    !host || host.length > 253 || /[\s/@]/.test(host) ||
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    !user || !pass || !from || from.length > 500 || /[\r\n]/.test(from)
  ) {
    throw new Error("Aveiro SMTP delivery is not configured correctly.");
  }

  return { host, port, user, pass, from };
}

export function assertMagicLinkMailConfigured(env: NodeJS.ProcessEnv = process.env): void {
  getCanonicalAuthOrigin(env);
  smtpConfig(env);
}

export function buildMagicLinkUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Magic-link token is invalid.");
  return getCanonicalAuthOrigin(env) + "/auth#aveiro_magic=" + encodeURIComponent(token);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Vendor-neutral SMTP adapter; the SMTP provider is changed through environment configuration. */
export async function sendMagicLinkEmail(
  recipient: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const config = smtpConfig(env);
  const url = buildMagicLinkUrl(token, env);
  const safeUrl = escapeHtml(url);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    ...(config.port === 465 ? {} : { requireTLS: true }),
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
    maxRecipients: 1,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: recipient,
      subject: "Tu enlace de acceso a AveiroAI",
      text:
        "Se solicitó iniciar sesión en AveiroAI. Si esta dirección puede acceder, abre este enlace en el mismo navegador. " +
        "El enlace es de un solo uso y caduca en 15 minutos.\n\n" + url +
        "\n\nSi no solicitaste este acceso, puedes ignorar este mensaje.",
      html:
        "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#20232b\">" +
        "<h2>Acceso a AveiroAI</h2>" +
        "<p>Se solicitó iniciar sesión con esta dirección. El enlace es de un solo uso y caduca en 15 minutos.</p>" +
        "<p><a href=\"" + safeUrl + "\">Continuar a AveiroAI</a></p>" +
        "<p>Si no solicitaste este acceso, ignora este mensaje.</p></body></html>"
    });
  } finally {
    transporter.close();
  }
}
