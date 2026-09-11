// Deliberately fixed to loopback, with no credentials, remote URL or timestamp
// override. This invokes the actual handler, never backfills invented history.
export async function sampleLocal(request = fetch) {
  const response = await request(
    "http://127.0.0.1:8787/cdn-cgi/local/scheduled?format=json",
    { redirect: "error", signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Local scheduled collection failed");
  }
  const result = await response.json();
  if (result?.outcome !== "ok")
    throw new Error("Local scheduled collection failed");
}

if (import.meta.main) {
  try {
    await sampleLocal();
    console.log(
      "Local scheduled collection completed. Reload the health experiment to view its recorded check.",
    );
  } catch {
    console.error(
      "Local scheduled collection failed. Start the local Worker with built assets and applied migrations, then check its log.",
    );
    process.exitCode = 1;
  }
}
