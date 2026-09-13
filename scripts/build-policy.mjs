import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { securityHeaders } from "../src/security/policy.ts";
import { siteEnvironment } from "./site-environment.mjs";

export async function writeBuildPolicy(directory) {
  const environment = siteEnvironment();
  const pages = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith(".html")) pages.push(file);
    }
  }
  await visit(directory);
  const hashes = new Set();
  const styles = new Set();
  for (const page of pages) {
    const html = await readFile(page, "utf8");
    for (const [, body] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
      styles.add(
        `'sha256-${createHash("sha256").update(body).digest("base64")}'`,
      );
    for (const [, attributes, body] of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      if (/\bsrc=/.test(attributes)) continue;
      hashes.add(
        `'sha256-${createHash("sha256").update(body).digest("base64")}'`,
      );
    }
  }
  const headers = securityHeaders(
    environment.name === "development",
    [...hashes].sort(),
    [...styles].sort(),
  );
  await writeFile(
    join(directory, "_headers"),
    "/*\n" +
      Object.entries(headers)
        .map(([key, value]) => `  ${key}: ${value}\n`)
        .join("") +
      (environment.name === "production"
        ? "\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        : ""),
  );
  await writeFile(
    join(directory, "robots.txt"),
    environment.origin
      ? `User-agent: *\nAllow: /\nSitemap: ${environment.origin}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
  if (environment.origin) {
    const escape = (value) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll('"', "&quot;");
    const paths = pages
      .map((page) => relative(directory, page).replace(/index\.html$/, ""))
      .sort();
    await writeFile(
      join(directory, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escape(new URL(path, environment.origin + "/").href)}</loc></url>`).join("")}</urlset>\n`,
    );
  }
}
