import { createHmac, randomBytes } from "node:crypto";

export type CommunityNodeConfig = {
  nodeId: string;
  secret: string;
  modelId: string;
  modelName: string;
  baseUrl: string;
};

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" ||
    (host.startsWith("127.") && /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host));
}

/**
 * Reads only server-side environment variables. Returns null when the
 * community node is entirely unconfigured; partial configuration is an error.
 */
export function getCommunityNodeConfig(
  env: NodeJS.ProcessEnv = process.env
): CommunityNodeConfig | null {
  const urlValue = env.AVEIRO_PROVIDER_NODE_URL?.trim() || "";
  const nodeId = env.AVEIRO_NODE_ID?.trim() || "";
  const secret = env.AVEIRO_NODE_SECRET || "";
  const modelId = env.AVEIRO_COMMUNITY_MODEL_ID?.trim() || "";
  const modelName = env.AVEIRO_COMMUNITY_MODEL_NAME?.trim() || modelId;
  const values = [urlValue, nodeId, secret, modelId];
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error("Community node configuration is incomplete. Configure URL, node ID, secret and model ID together.");
  }
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(nodeId)) {
    throw new Error("AVEIRO_NODE_ID has an invalid format.");
  }
  if (secret.length < 32) {
    throw new Error("AVEIRO_NODE_SECRET must contain at least 32 characters.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(modelId) || modelId === "*") {
    throw new Error("AVEIRO_COMMUNITY_MODEL_ID has an invalid format.");
  }

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("AVEIRO_PROVIDER_NODE_URL must be a valid URL.");
  }
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Provider node URL must be HTTPS (HTTP is allowed only for loopback development) and contain no path or credentials.");
  }

  return {
    nodeId,
    secret,
    modelId,
    modelName: modelName.slice(0, 100),
    baseUrl: url.origin
  };
}

export function signCommunityNodeRequest(
  config: CommunityNodeConfig,
  method: "GET" | "POST",
  path: string,
  body = ""
): Record<string, string> {
  const timestamp = String(Date.now());
  const nonce = randomBytes(18).toString("hex");
  const payload = [
    method,
    path,
    timestamp,
    nonce,
    config.nodeId,
    body
  ].join("\n");
  const signature = createHmac("sha256", config.secret)
    .update(payload, "utf8")
    .digest("hex");

  return {
    "X-Aveiro-Node-Id": config.nodeId,
    "X-Aveiro-Timestamp": timestamp,
    "X-Aveiro-Nonce": nonce,
    "X-Aveiro-Signature": signature
  };
}

export function communityNodeEndpoint(config: CommunityNodeConfig, path: string): string {
  return new URL(path, config.baseUrl).toString();
}
