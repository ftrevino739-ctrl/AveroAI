import { createHmac, timingSafeEqual } from "node:crypto";

function signaturePayload({ method, path, timestamp, nonce, nodeId, body }) {
  return [
    method.toUpperCase(),
    path,
    timestamp,
    nonce,
    nodeId,
    body
  ].join("\n");
}

export function createRequestSignature({
  method,
  path,
  timestamp,
  nonce,
  nodeId,
  body = "",
  secret
}) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("AVEIRO_NODE_SECRET must contain at least 32 characters.");
  }

  return createHmac("sha256", secret)
    .update(signaturePayload({ method, path, timestamp, nonce, nodeId, body }))
    .digest("hex");
}

export function verifyRequestSignature({
  signature,
  method,
  path,
  timestamp,
  nonce,
  nodeId,
  body = "",
  secret
}) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const expected = createRequestSignature({
    method,
    path,
    timestamp,
    nonce,
    nodeId,
    body,
    secret
  });

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}
