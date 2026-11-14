import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const NODE_KEY_PREFIX = "aveiro:provider-node:";
const NODE_INDEX_KEY = "aveiro:provider-nodes";
const HEARTBEAT_PATH = "/api/provider-nodes/heartbeat";
const HEARTBEAT_WINDOW_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const OFFLINE_AFTER_MS = 90_000;
const RESERVATION_TTL_SECONDS = 240;
const RESERVE_SLOT_SCRIPT = `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local maximum = tonumber(ARGV[1])
if current >= maximum then return 0 end
local next = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return next`;
const RELEASE_SLOT_SCRIPT = `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 1 then return redis.call('DEL', KEYS[1]) end
return redis.call('DECR', KEYS[1])`;

type RedisReply<T> = { result?: T; error?: string };
type NodeRecord = {
  nodeId: string;
  label: string;
  baseUrl: string;
  allowedModels: string[];
  encryptedSecret: string;
  createdAt: number;
  lastHeartbeatAt: number | null;
  runtime: string | null;
  runtimeStatus: "ready" | "unavailable" | "unknown";
  availableModels: string[];
  activeJobs: number;
  maxConcurrent: number;
  revokedAt: number | null;
};

export type ProviderNodeSummary = Omit<NodeRecord, "encryptedSecret"> & {
  status: "online" | "offline" | "revoked";
  ready: boolean;
};

function redisConfiguration() {
  const endpoint = process.env.AVEIRO_REDIS_REST_URL?.trim() || "";
  const token = process.env.AVEIRO_REDIS_REST_TOKEN || "";
  if (!endpoint || !token) {
    throw new Error("Provider registry storage is not configured.");
  }
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("AVEIRO_REDIS_REST_URL must be an HTTPS URL without embedded credentials.");
  }
  return { url: url.toString().replace(/\/$/, ""), token };
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const config = redisConfiguration();
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Provider registry storage request failed.");
  const payload = await response.json() as RedisReply<T>;
  if (payload.error) throw new Error("Provider registry storage command failed.");
  return payload.result as T;
}

function encryptionKey(): Buffer {
  const value = process.env.AVEIRO_NODE_SECRET_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("AVEIRO_NODE_SECRET_ENCRYPTION_KEY must be a 32-byte hexadecimal key.");
  }
  return Buffer.from(value, "hex");
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptSecret(value: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored node credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function validateProviderEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("endpointUrl must be a valid URL.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\\.$/, "");
  const localHttp = url.protocol === "http:" && process.env.NODE_ENV !== "production" &&
    (hostname === "localhost" || (isIP(hostname) === 4 && hostname.startsWith("127.")));
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (!localHttp && (!hostname.includes(".") || isIP(hostname) !== 0 ||
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal")))
  ) {
    throw new Error("endpointUrl must be a public HTTPS origin without credentials, path or query.");
  }
  return url.origin;
}

function approvedModels(): string[] {
  const values = (process.env.AVEIRO_APPROVED_COMMUNITY_MODELS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)].filter((value) =>
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value) && value !== "*"
  );
}

function nodeKey(nodeId: string) {
  return NODE_KEY_PREFIX + nodeId;
}

async function readNode(nodeId: string): Promise<NodeRecord | null> {
  const raw = await redisCommand<string | null>(["GET", nodeKey(nodeId)]);
  return raw ? JSON.parse(raw) as NodeRecord : null;
}

async function writeNode(record: NodeRecord) {
  await redisCommand<string>(["SET", nodeKey(record.nodeId), JSON.stringify(record)]);
  await redisCommand<number>(["SADD", NODE_INDEX_KEY, record.nodeId]);
}

function toSummary(record: NodeRecord, now = Date.now()): ProviderNodeSummary {
  const status = record.revokedAt
    ? "revoked"
    : record.lastHeartbeatAt !== null && now - record.lastHeartbeatAt <= OFFLINE_AFTER_MS
      ? "online"
      : "offline";
  const { encryptedSecret: _secret, ...safe } = record;
  return {
    ...safe,
    status,
    ready: status === "online" && record.runtimeStatus === "ready" && record.availableModels.length > 0
  };
}

export async function createProviderNode(input: {
  label: string;
  baseUrl: string;
  allowedModels: string[];
}): Promise<{ node: ProviderNodeSummary; secret: string }> {
  const approved = approvedModels();
  if (!approved.length) {
    throw new Error("No community model is approved. Configure AVEIRO_APPROVED_COMMUNITY_MODELS after licensing review.");
  }
  if (!Array.isArray(input.allowedModels) || input.allowedModels.length < 1 || input.allowedModels.length > 8) {
    throw new Error("Choose between 1 and 8 approved model IDs.");
  }
  const allowedModels = [...new Set(input.allowedModels)];
  if (allowedModels.some((id) => !approved.includes(id))) {
    throw new Error("A requested model is not in AVEIRO_APPROVED_COMMUNITY_MODELS.");
  }
  const baseUrl = validateProviderEndpoint(input.baseUrl);
  const nodeId = "avn_" + randomBytes(10).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const record: NodeRecord = {
    nodeId,
    label: input.label.trim().slice(0, 80),
    baseUrl,
    allowedModels,
    encryptedSecret: encryptSecret(secret),
    createdAt: Date.now(),
    lastHeartbeatAt: null,
    runtime: null,
    runtimeStatus: "unknown",
    availableModels: [],
    activeJobs: 0,
    maxConcurrent: 1,
    revokedAt: null
  };
  await writeNode(record);
  return { node: toSummary(record), secret };
}

async function allProviderNodeRecords(): Promise<NodeRecord[]> {
  const ids = await redisCommand<string[]>(["SMEMBERS", NODE_INDEX_KEY]);
  const records = await Promise.all((ids || []).map((id) => readNode(id)));
  return records.filter((record): record is NodeRecord => Boolean(record));
}

export async function listProviderNodes(): Promise<ProviderNodeSummary[]> {
  return (await allProviderNodeRecords())
    .map((record) => toSummary(record))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAvailableCommunityModels(): Promise<string[]> {
  const now = Date.now();
  const records = await allProviderNodeRecords();
  return [...new Set(records
    .filter((record) =>
      !record.revokedAt &&
      record.lastHeartbeatAt !== null &&
      now - record.lastHeartbeatAt <= OFFLINE_AFTER_MS &&
      record.runtimeStatus === "ready"
    )
    .flatMap((record) => record.availableModels))].sort();
}

export type ProviderNodeReservation = {
  nodeId: string;
  label: string;
  baseUrl: string;
  modelId: string;
  secret: string;
  release: () => Promise<void>;
};

export async function reserveProviderNodeForModel(modelId: string): Promise<ProviderNodeReservation | null> {
  const now = Date.now();
  const records = (await allProviderNodeRecords())
    .filter((record) =>
      !record.revokedAt &&
      record.baseUrl &&
      record.lastHeartbeatAt !== null &&
      now - record.lastHeartbeatAt <= OFFLINE_AFTER_MS &&
      record.runtimeStatus === "ready" &&
      record.availableModels.includes(modelId)
    )
    .sort((a, b) => a.activeJobs / a.maxConcurrent - b.activeJobs / b.maxConcurrent);

  for (const record of records) {
    const key = `aveiro:provider-node:reservations:${record.nodeId}`;
    const reserved = await redisCommand<number>([
      "EVAL", RESERVE_SLOT_SCRIPT, "1", key,
      String(record.maxConcurrent), String(RESERVATION_TTL_SECONDS)
    ]);
    if (Number(reserved) < 1) continue;

    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await redisCommand<number>(["EVAL", RELEASE_SLOT_SCRIPT, "1", key]).catch(() => 0);
    };

    return {
      nodeId: record.nodeId,
      label: record.label,
      baseUrl: record.baseUrl,
      modelId,
      secret: decryptSecret(record.encryptedSecret),
      release
    };
  }
  return null;
}

export async function revokeProviderNode(nodeId: string): Promise<boolean> {
  const record = await readNode(nodeId);
  if (!record) return false;
  record.revokedAt = Date.now();
  record.availableModels = [];
  record.runtimeStatus = "unavailable";
  await writeNode(record);
  return true;
}

function verifySignature(input: {
  secret: string;
  signature: string;
  timestamp: string;
  nonce: string;
  nodeId: string;
  rawBody: string;
}): boolean {
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const payload = ["POST", HEARTBEAT_PATH, input.timestamp, input.nonce, input.nodeId, input.rawBody].join("\n");
  const expected = createHmac("sha256", input.secret).update(payload, "utf8").digest();
  const received = Buffer.from(input.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function acceptProviderHeartbeat(
  rawBody: string,
  headers: Headers
): Promise<{ ok: true; ready: boolean } | { ok: false; status: number; error: string }> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Heartbeat body must be valid JSON." };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "Heartbeat payload is invalid." };
  }
  const data = payload as Record<string, unknown>;
  const nodeId = typeof data.nodeId === "string" ? data.nodeId : "";
  if (!/^avn_[a-f0-9]{20}$/.test(nodeId)) {
    return { ok: false, status: 400, error: "A valid node ID is required." };
  }
  const record = await readNode(nodeId);
  if (!record) return { ok: false, status: 404, error: "Provider node is not registered." };
  if (record.revokedAt) return { ok: false, status: 410, error: "Provider node credentials have been revoked." };

  const timestamp = headers.get("x-aveiro-timestamp") || "";
  const nonce = headers.get("x-aveiro-nonce") || "";
  const signature = headers.get("x-aveiro-signature") || "";
  const signedNodeId = headers.get("x-aveiro-node-id") || "";
  const time = Number(timestamp);
  if (
    signedNodeId !== nodeId ||
    !/^\d{13}$/.test(timestamp) ||
    !Number.isSafeInteger(time) ||
    Math.abs(Date.now() - time) > HEARTBEAT_WINDOW_MS ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)
  ) {
    return { ok: false, status: 401, error: "Invalid or expired heartbeat authentication." };
  }
  if (!verifySignature({
    secret: decryptSecret(record.encryptedSecret),
    signature,
    timestamp,
    nonce,
    nodeId,
    rawBody
  })) {
    return { ok: false, status: 401, error: "Invalid heartbeat signature." };
  }

  const replay = await redisCommand<string | null>([
    "SET", `aveiro:provider-node:nonce:${nodeId}:${nonce}`, "1", "EX", "120", "NX"
  ]);
  if (replay !== "OK") return { ok: false, status: 401, error: "Heartbeat nonce was already used." };

  const models = Array.isArray(data.models) ? data.models as unknown[] : null;
  const activeJobs = data.activeJobs;
  const maxConcurrent = data.maxConcurrent;
  const runtime = data.runtime;
  const runtimeStatus = data.runtimeStatus;
  if (
    !models || models.length > 8 ||
    models.some((model) => typeof model !== "string" || !record.allowedModels.includes(model)) ||
    !Number.isInteger(activeJobs) || (activeJobs as number) < 0 ||
    !Number.isInteger(maxConcurrent) || (maxConcurrent as number) < 1 || (maxConcurrent as number) > 32 ||
    (activeJobs as number) > (maxConcurrent as number) ||
    (runtimeStatus !== "ready" && runtimeStatus !== "unavailable") ||
    runtime !== "openai-compatible-http"
  ) {
    return { ok: false, status: 400, error: "Heartbeat capabilities do not match the registered node policy." };
  }

  record.availableModels = [...new Set(models as string[])];
  record.activeJobs = activeJobs as number;
  record.maxConcurrent = maxConcurrent as number;
  record.runtime = runtime;
  record.runtimeStatus = runtimeStatus as "ready" | "unavailable";
  record.lastHeartbeatAt = Date.now();
  await writeNode(record);
  return { ok: true, ready: toSummary(record).ready };
}
