import { randomBytes } from "node:crypto";
import { createRequestSignature } from "./signing.mjs";

const HEARTBEAT_PATH = "/api/provider-nodes/heartbeat";

export function startControlPlaneHeartbeat({
  controlPlaneUrl,
  nodeId,
  secret,
  getSnapshot,
  intervalMs = 30_000,
  fetchImpl = fetch,
  onError = () => {}
}) {
  const endpoint = new URL(HEARTBEAT_PATH, controlPlaneUrl);
  let stopped = false;
  let inFlight = false;

  async function sendNow() {
    if (stopped || inFlight) return null;
    inFlight = true;
    try {
      const snapshot = await getSnapshot();
      const body = JSON.stringify({ nodeId, ...snapshot });
      const timestamp = String(Date.now());
      const nonce = randomBytes(18).toString("hex");
      const signature = createRequestSignature({
        method: "POST",
        path: HEARTBEAT_PATH,
        timestamp,
        nonce,
        nodeId,
        body,
        secret
      });
      const response = await fetchImpl(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "Content-Type": "application/json",
          "X-Aveiro-Node-Id": nodeId,
          "X-Aveiro-Timestamp": timestamp,
          "X-Aveiro-Nonce": nonce,
          "X-Aveiro-Signature": signature
        },
        body
      });
      if (!response.ok) {
        const error = new Error("Aveiro control plane rejected the provider heartbeat.");
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      onError(error);
      return null;
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => {
    void sendNow();
  }, intervalMs);
  timer.unref?.();
  void sendNow();

  return {
    sendNow,
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}
