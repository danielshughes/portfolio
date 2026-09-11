export function securityHeaders(
  development: boolean,
  hashes: string[] = [],
  styles: string[] = [],
): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' https://challenges.cloudflare.com ${hashes.join(" ")}`.trim(),
      "frame-src https://challenges.cloudflare.com",
      "style-src 'self'",
      `style-src-elem 'self' ${styles.join(" ")}`.trim(),
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    ...(development ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  };
}
