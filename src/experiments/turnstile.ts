interface Turnstile {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  execute(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<Turnstile> | undefined;
function load(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const timer = setTimeout(() => fail(), 10000);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("Verification did not load"));
    };
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export async function humanToken(
  element: HTMLElement,
  siteKey: string,
  scenario: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  // Cancel this caller promptly without removing the shared SDK download.
  const turnstile = await new Promise<Turnstile>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    void load().then(
      (api) => {
        cleanup();
        resolve(api);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    let id: string | undefined;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      if (id) turnstile.remove(id);
      element.replaceChildren();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Verification failed"));
      return true;
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      id = turnstile.render(element, {
        sitekey: siteKey,
        action: `triage-${scenario}`,
        theme: "auto",
        size:
          (element.parentElement?.clientWidth ?? 0) < 300
            ? "compact"
            : "flexible",
        execution: "execute",
        appearance: "interaction-only",
        retry: "never",
        "refresh-expired": "never",
        "response-field": false,
        callback: (token: string) => {
          cleanup();
          resolve(token);
        },
        "error-callback": failed,
        "expired-callback": failed,
        "timeout-callback": failed,
      });
      turnstile.execute(id);
    } catch {
      failed();
    }
  });
}
