import { createServer } from "node:http";
import { isIP } from "node:net";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { verifyRequestSignature } from "./signing.mjs";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 60_000;
const MAX_REPLAY_ENTRIES = 10_000;
const SIGNATURE_WINDOW_MS = 60_000;
const REPLAY_TTL_MS = 120_000;

function json(res, status, value, extraHeaders = {}) {
  if (res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  res.end(JSON.stringify(value));
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" ||
    (isIP(host) === 4 && host.startsWith("127."));
}

function validateUpstreamBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LOCAL_INFERENCE_BASE_URL must be a valid URL.");
  }

  if (
    url.protocol !== "http:" ||
    !isLoopbackHost(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The local inference endpoint must be an HTTP loopback URL without credentials, query parameters or fragments."
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Provider-node configuration is required.");
  }
  if (typeof config.nodeId !== "string" || !/^[a-zA-Z0-9._-]{3,80}$/.test(config.nodeId)) {
    throw new Error("AVEIRO_NODE_ID must be 3–80 letters, numbers, dots, underscores or hyphens.");
  }
  if (typeof config.secret !== "string" || config.secret.length < 32) {
    throw new Error("AVEIRO_NODE_SECRET must contain at least 32 characters.");
  }
  if (!(config.allowedModels instanceof Set) || config.allowedModels.size === 0) {
    throw new Error("At least one exact model ID must be configured in AVEIRO_ALLOWED_MODELS.");
  }
  for (const modelId of config.allowedModels) {
    if (typeof modelId !== "string" || modelId.length < 1 || modelId.length > 200 || modelId === "*") {
      throw new Error("AVEIRO_ALLOWED_MODELS contains an invalid model ID.");
    }
  }

  const upstreamBaseUrl = validateUpstreamBaseUrl(config.upstreamBaseUrl);
  const maxConcurrent = Number(config.maxConcurrent ?? 1);
  const requestTimeoutMs = Number(config.requestTimeoutMs ?? 120_000);
  const port = Number(config.port ?? 8787);

  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 32) {
    throw new Error("AVEIRO_NODE_MAX_CONCURRENT must be an integer from 1 to 32.");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 10_000 || requestTimeoutMs > 600_000) {
    throw new Error("AVEIRO_NODE_REQUEST_TIMEOUT_MS must be between 10000 and 600000.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  return {
    nodeId: config.nodeId,
    secret: config.secret,
    allowedModels: config.allowedModels,
    upstreamBaseUrl,
    localApiKey: typeof config.localApiKey === "string" ? config.localApiKey : "",
    maxConcurrent,
    requestTimeoutMs,
    port,
    maxBodyBytes: 100_000
  };
}

export function loadConfig(env = process.env) {
  const allowedModels = new Set(
    String(env.AVEIRO_ALLOWED_MODELS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return validateConfig({
    nodeId: env.AVEIRO_NODE_ID,
    secret: env.AVEIRO_NODE_SECRET,
    allowedModels,
    upstreamBaseUrl: env.LOCAL_INFERENCE_BASE_URL || "http://127.0.0.1:8000/v1",
    localApiKey: env.LOCAL_INFERENCE_API_KEY || "",
    maxConcurrent: env.AVEIRO_NODE_MAX_CONCURRENT || "1",
    requestTimeoutMs: env.AVEIRO_NODE_REQUEST_TIMEOUT_MS || "120000",
    port: env.PORT || "8787"
  });
}

function validateJob(value, allowedModels) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Invalid inference job." };
  }
  const { requestId, modelId, messages } = value;

  if (typeof requestId !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(requestId)) {
    return { error: "A valid requestId is required." };
  }
  if (typeof modelId !== "string" || !allowedModels.has(modelId)) {
    return { error: "This node is not authorized to serve the requested model.", status: 403 };
  }
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return { error: "Messages must contain between 1 and 40 entries." };
  }

  let total = 0;
  let hasUserMessage = false;
  const safeMessages = [];

  for (const message of messages) {
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      !["system", "user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.length > MAX_MESSAGE_CHARS
    ) {
      return { error: "A message has an invalid role or content." };
    }

    total += message.content.length;
    if (message.role === "user") hasUserMessage = true;
    safeMessages.push({ role: message.role, content: message.content });
  }

  if (total > MAX_TOTAL_CHARS) {
    return { error: "The conversation is too large." , status: 413 };
  }
  if (!hasUserMessage) {
    return { error: "At least one user message is required." };
  }

  return { job: { requestId, modelId, messages: safeMessages } };
}

export function createProviderNodeServer(inputConfig) {
  const config = validateConfig(inputConfig);
  const replayedNonces = new Map();
  let activeJobs = 0;

  function authenticate(req, pathname, rawBody) {
    const nodeId = req.headers["x-aveiro-node-id"];
    const timestamp = req.headers["x-aveiro-timestamp"];
    const nonce = req.headers["x-aveiro-nonce"];
    const signature = req.headers["x-aveiro-signature"];

    if (
      typeof nodeId !== "string" ||
      typeof timestamp !== "string" ||
      typeof nonce !== "string" ||
      typeof signature !== "string" ||
      nodeId !== config.nodeId ||
      !/^\d{13}$/.test(timestamp) ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)
    ) {
      return false;
    }

    const timestampMs = Number(timestamp);
    const now = Date.now();
    if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_WINDOW_MS) {
      return false;
    }

    for (const [key, expiresAt] of replayedNonces) {
      if (expiresAt <= now) replayedNonces.delete(key);
    }

    const replayKey = nodeId + ":" + nonce;
    if (replayedNonces.has(replayKey) || replayedNonces.size >= MAX_REPLAY_ENTRIES) {
      return false;
    }

    const valid = verifyRequestSignature({
      signature,
      method: req.method,
      path: pathname,
      timestamp,
      nonce,
      nodeId,
      body: rawBody.toString("utf8"),
      secret: config.secret
    });

    if (!valid) return false;
    replayedNonces.set(replayKey, now + REPLAY_TTL_MS);
    return true;
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { status: "ok", service: "aveiro-provider-node" });
    }

    const isCapabilities = req.method === "GET" && url.pathname === "/v1/node/capabilities";
    const isInference = req.method === "POST" && url.pathname === "/v1/node/infer";
    if (!isCapabilities && !isInference) {
      return json(res, 404, { error: "Not found." });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(req, config.maxBodyBytes);
    } catch (error) {
      return json(res, error.statusCode || 400, { error: error.statusCode === 413 ? error.message : "Could not read request body." });
    }

    if (isCapabilities && rawBody.length !== 0) {
      return json(res, 400, { error: "Capabilities requests must not include a body." });
    }
    if (isInference && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      return json(res, 415, { error: "Content-Type must be application/json." });
    }
    if (!authenticate(req, url.pathname, rawBody)) {
      return json(res, 401, { error: "Invalid, expired or replayed node signature." });
    }

    if (isCapabilities) {
      return json(res, 200, {
        nodeId: config.nodeId,
        protocolVersion: 1,
        runtime: "openai-compatible-http",
        models: [...config.allowedModels],
        activeJobs,
        maxConcurrent: config.maxConcurrent
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return json(res, 400, { error: "Request body must be valid UTF-8 JSON." });
    }

    const validation = validateJob(parsed, config.allowedModels);
    if (validation.error) {
      return json(res, validation.status || 400, { error: validation.error });
    }
    if (activeJobs >= config.maxConcurrent) {
      return json(res, 429, { error: "This provider node is at capacity." }, { "Retry-After": "3" });
    }

    const { job } = validation;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.requestTimeoutMs);
    timeout.unref?.();

    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", abortOnDisconnect);
    activeJobs += 1;

    try {
      const endpoint = new URL(
        config.upstreamBaseUrl.pathname + "/chat/completions",
        config.upstreamBaseUrl.origin
      );
      const headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      };
      if (config.localApiKey) headers.Authorization = "Bearer " + config.localApiKey;

      const upstream = await fetch(endpoint, {
        method: "POST",
        headers,
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify({
          model: job.modelId,
          messages: job.messages,
          stream: true
        })
      });

      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => {});
        return json(res, 502, { error: "The local inference runtime rejected the job." });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
        "X-Aveiro-Request-Id": job.requestId
      });

      for await (const chunk of upstream.body) {
        if (res.destroyed) break;
        if (!res.write(chunk)) {
          await new Promise((resolve) => {
            res.once("drain", resolve);
            res.once("close", resolve);
          });
        }
      }
      if (!res.destroyed && !res.writableEnded) res.end();
    } catch {
      if (!res.headersSent && !res.destroyed) {
        return json(
          res,
          timedOut ? 504 : 502,
          { error: timedOut ? "The local inference runtime timed out." : "Could not reach the local inference runtime." }
        );
      }
      if (!res.destroyed) res.destroy();
    } finally {
      clearTimeout(timeout);
      res.off("close", abortOnDisconnect);
      activeJobs = Math.max(0, activeJobs - 1);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig();
    const server = createProviderNodeServer(config);
    server.listen(config.port, "0.0.0.0", () => {
      process.stdout.write("Aveiro Provider Node listening on port " + config.port + "\n");
    });
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : "Invalid configuration.") + "\n");
    process.exitCode = 1;
  }
}
