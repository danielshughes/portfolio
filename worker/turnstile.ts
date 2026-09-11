import { isRecord } from "../src/experiments/triage-answer.ts";

export async function verifyHuman(
  token: string,
  secret: string,
  hostname: string,
  action: string,
): Promise<boolean> {
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      // Workers supports manual/follow, not the browser's "error" mode.
      // A redirect is a failed verification, never a destination to send secrets.
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Verification unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Verification unavailable");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new Error("Verification unavailable");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
  // Siteverify enforces expiry and single use. Never cache success or retry
  // validation with an idempotency key: that could authorise another inference.
  return (
    isRecord(result) &&
    result.success === true &&
    result.hostname === hostname &&
    result.action === action
  );
}
