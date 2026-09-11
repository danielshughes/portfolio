export function siteEnvironment(env = process.env) {
  const name = env.SITE_ENV ?? "development";
  if (!["development", "production"].includes(name))
    throw new Error("SITE_ENV must be development or production");
  if (name === "development") return { name, origin: undefined };
  let url;
  try {
    url = new URL(env.SITE_URL);
  } catch {
    throw new Error("Production requires a valid HTTPS SITE_URL origin");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    env.SITE_URL.includes("@") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^https:\/\/[^/?#]+\/?$/.test(env.SITE_URL)
  )
    throw new Error(
      "Production SITE_URL must be an HTTPS origin without credentials, path, query or fragment",
    );
  return { name, origin: url.origin };
}
