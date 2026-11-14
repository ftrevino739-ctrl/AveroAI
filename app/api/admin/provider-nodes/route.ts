import { timingSafeEqual } from "node:crypto";
import { createProviderNode, listProviderNodes, revokeProviderNode } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class AdminRequestError extends Error {}

function authorized(request: Request): boolean {
  const expected = process.env.AVEIRO_ADMIN_TOKEN || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") || "");
  if (expected.length < 32 || !match) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(match[1]);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AdminRequestError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_000) {
        await reader.cancel();
        throw new AdminRequestError("Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AdminRequestError("Request body must be valid JSON.");
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json({ nodes: await listProviderNodes() }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof AdminRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Provider registry storage is unavailable or misconfigured." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await readBody(request);
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const baseUrl = typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : "";
    const allowedModels = body.allowedModels;
    if (!label || label.length > 80 || !baseUrl || !Array.isArray(allowedModels)) {
      return Response.json({ error: "Provide a node label, HTTPS endpointUrl and allowedModels array." }, { status: 400 });
    }
    const created = await createProviderNode({
      label,
      baseUrl,
      allowedModels: allowedModels as string[]
    });
    return Response.json({
      node: created.node,
      secret: created.secret,
      secretShownOnce: true,
      setup: {
        AVEIRO_NODE_ID: created.node.nodeId,
        AVEIRO_NODE_SECRET: created.secret,
        AVEIRO_ALLOWED_MODELS: created.node.allowedModels.join(",")
      }
    }, {
      status: 201,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create provider node.";
    const clientError = error instanceof AdminRequestError ||
      /approved|Choose between|label|endpointUrl|public HTTPS|model IDs|requested model/i.test(message);
    return Response.json({
      error: clientError ? message : "Provider node could not be created. Check server registry configuration."
    }, { status: clientError ? 400 : 503 });
  }
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await readBody(request);
    const nodeId = typeof body.nodeId === "string" ? body.nodeId : "";
    if (!/^avn_[a-f0-9]{20}$/.test(nodeId)) {
      return Response.json({ error: "A valid nodeId is required." }, { status: 400 });
    }
    const revoked = await revokeProviderNode(nodeId);
    return revoked
      ? Response.json({ revoked: true, nodeId }, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "Provider node not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Provider registry storage is unavailable or misconfigured." }, { status: 503 });
  }
}
