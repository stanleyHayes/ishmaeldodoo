const deploymentEnvironments = new Set([
  "local",
  "preview",
  "staging",
  "production",
]);

export function parseAdminEnvironment(environment) {
  const deploymentEnvironment =
    environment.NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV ?? "local";
  if (!deploymentEnvironments.has(deploymentEnvironment))
    throw new Error("NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV is invalid");
  const rawApiBaseUrl = environment.NEXT_PUBLIC_API_BASE_URL;
  if (!rawApiBaseUrl) throw new Error("NEXT_PUBLIC_API_BASE_URL is required");
  let url;
  try {
    url = new URL(rawApiBaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an absolute URL");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("NEXT_PUBLIC_API_BASE_URL contains prohibited URL parts");
  if (!/^\/v1\/?$/u.test(url.pathname))
    throw new Error("NEXT_PUBLIC_API_BASE_URL must end at /v1");
  if (
    deploymentEnvironment !== "local" &&
    (url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error(
      "Non-local Admin deployments require a non-loopback HTTPS API origin",
    );
  return {
    deploymentEnvironment,
    apiBaseUrl: `${url.origin}/v1`,
    apiOrigin: url.origin,
  };
}
