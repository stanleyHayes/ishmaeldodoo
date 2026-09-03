import "server-only";
import { z } from "zod";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const optionalEnvironmentString = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    schema.optional(),
  );

const webEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AMANOR_DEPLOYMENT_ENV: z
      .enum(["local", "preview", "staging", "production"])
      .default("local"),
    PUBLIC_API_BASE_URL: z.url().default("http://localhost:4000/v1"),
    PUBLIC_API_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(3_000),
    PUBLIC_WEB_BASE_URL: z.url().default("http://localhost:3000"),
    REVALIDATION_WEBHOOK_KEYS: z.string().optional(),
    REVALIDATION_AUDIENCE: z.string().min(1).default("amanor-public-web"),
    PUBLIC_SERVICE_KEY_ID: z.string().min(1).optional(),
    PUBLIC_SERVICE_SECRET: z.string().min(32).optional(),
    PUBLIC_SERVICE_AUDIENCE: z.string().min(1).default("amanor-public-api"),
    PUBLIC_INDEXING_ENABLED: z.enum(["true", "false"]).default("false"),
    ANALYTICS_EVENT_ENDPOINT: optionalEnvironmentString(z.url()),
    ANALYTICS_SITE_ID: optionalEnvironmentString(
      z.string().trim().min(1).max(253),
    ),
    LEAFLET_TILE_URL: z
      .url()
      .default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
    LEAFLET_TILE_ATTRIBUTION: z
      .string()
      .min(1)
      .default("© OpenStreetMap contributors"),
  })
  .superRefine((value, context) => {
    const apiUrl = new URL(value.PUBLIC_API_BASE_URL);
    const webUrl = new URL(value.PUBLIC_WEB_BASE_URL);
    const prohibitedParts = (url: URL) =>
      Boolean(url.username || url.password || url.search || url.hash);

    if (
      prohibitedParts(apiUrl) ||
      !["http:", "https:"].includes(apiUrl.protocol)
    )
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_API_BASE_URL"],
        message: "PUBLIC_API_BASE_URL contains prohibited URL parts",
      });
    if (!/^\/v1\/?$/u.test(apiUrl.pathname))
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_API_BASE_URL"],
        message: "PUBLIC_API_BASE_URL must end at /v1",
      });
    if (
      prohibitedParts(webUrl) ||
      webUrl.pathname !== "/" ||
      !["http:", "https:"].includes(webUrl.protocol)
    )
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_WEB_BASE_URL"],
        message: "PUBLIC_WEB_BASE_URL must be a credential-free origin",
      });
    if (
      apiUrl.protocol !== "https:" &&
      !(
        value.AMANOR_DEPLOYMENT_ENV === "local" &&
        apiUrl.protocol === "http:" &&
        loopbackHosts.has(apiUrl.hostname)
      )
    )
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_API_BASE_URL"],
        message: "Web API requires HTTPS except for loopback local development",
      });
    if (
      webUrl.protocol !== "https:" &&
      !(
        value.AMANOR_DEPLOYMENT_ENV === "local" &&
        webUrl.protocol === "http:" &&
        loopbackHosts.has(webUrl.hostname)
      )
    )
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_WEB_BASE_URL"],
        message:
          "Public Web requires HTTPS except for loopback local development",
      });
    if (
      value.AMANOR_DEPLOYMENT_ENV !== "local" &&
      (loopbackHosts.has(apiUrl.hostname) || loopbackHosts.has(webUrl.hostname))
    )
      context.addIssue({
        code: "custom",
        message: "Non-local Web deployments prohibit loopback origins",
      });
    if (apiUrl.origin === webUrl.origin)
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_API_BASE_URL"],
        message: "Public Web and API must use distinct origins",
      });
    if (
      Boolean(value.ANALYTICS_EVENT_ENDPOINT) !==
      Boolean(value.ANALYTICS_SITE_ID)
    )
      context.addIssue({
        code: "custom",
        message:
          "ANALYTICS_EVENT_ENDPOINT and ANALYTICS_SITE_ID must be configured together",
      });
    if (value.ANALYTICS_EVENT_ENDPOINT) {
      const analyticsUrl = new URL(value.ANALYTICS_EVENT_ENDPOINT);
      if (
        analyticsUrl.username ||
        analyticsUrl.password ||
        analyticsUrl.port ||
        analyticsUrl.search ||
        analyticsUrl.hash
      )
        context.addIssue({
          code: "custom",
          path: ["ANALYTICS_EVENT_ENDPOINT"],
          message: "ANALYTICS_EVENT_ENDPOINT contains prohibited URL parts",
        });
      if (
        analyticsUrl.protocol !== "https:" &&
        !(
          value.AMANOR_DEPLOYMENT_ENV === "local" &&
          analyticsUrl.protocol === "http:" &&
          loopbackHosts.has(analyticsUrl.hostname)
        )
      )
        context.addIssue({
          code: "custom",
          path: ["ANALYTICS_EVENT_ENDPOINT"],
          message:
            "Analytics requires HTTPS except for loopback local development",
        });
      if (
        value.AMANOR_DEPLOYMENT_ENV !== "local" &&
        loopbackHosts.has(analyticsUrl.hostname)
      )
        context.addIssue({
          code: "custom",
          path: ["ANALYTICS_EVENT_ENDPOINT"],
          message: "Non-local analytics must not use a loopback endpoint",
        });
    }
  });

export function parseWebEnvironment(
  environment: Record<string, string | undefined>,
) {
  const value = webEnvironmentSchema
    .superRefine((candidate, context) => {
      if (
        candidate.AMANOR_DEPLOYMENT_ENV === "production" &&
        !candidate.REVALIDATION_WEBHOOK_KEYS
      ) {
        context.addIssue({
          code: "custom",
          message: "Revalidation key ring is required in production",
        });
      }
      if (candidate.REVALIDATION_WEBHOOK_KEYS) {
        try {
          const keys = JSON.parse(
            candidate.REVALIDATION_WEBHOOK_KEYS,
          ) as Record<string, unknown>;
          if (
            Object.keys(keys).length < 1 ||
            Object.entries(keys).some(
              ([key, secret]) =>
                !key || typeof secret !== "string" || secret.length < 32,
            )
          )
            throw new Error();
        } catch {
          context.addIssue({
            code: "custom",
            message:
              "REVALIDATION_WEBHOOK_KEYS must be a JSON key ring with 32-byte secrets",
          });
        }
      }
      if (
        Boolean(candidate.PUBLIC_SERVICE_KEY_ID) !==
        Boolean(candidate.PUBLIC_SERVICE_SECRET)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "PUBLIC_SERVICE_KEY_ID and PUBLIC_SERVICE_SECRET must be configured together",
        });
      }
      if (
        candidate.AMANOR_DEPLOYMENT_ENV === "production" &&
        (!candidate.PUBLIC_SERVICE_KEY_ID || !candidate.PUBLIC_SERVICE_SECRET)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Public API service authentication is required in production",
        });
      }
    })
    .parse(environment);
  return {
    ...value,
    PUBLIC_API_BASE_URL: `${new URL(value.PUBLIC_API_BASE_URL).origin}/v1`,
    PUBLIC_WEB_BASE_URL: new URL(value.PUBLIC_WEB_BASE_URL).origin,
  };
}

export const webEnvironment = parseWebEnvironment(process.env);

export const publicServiceAuth =
  webEnvironment.PUBLIC_SERVICE_KEY_ID && webEnvironment.PUBLIC_SERVICE_SECRET
    ? {
        keyId: webEnvironment.PUBLIC_SERVICE_KEY_ID,
        secret: webEnvironment.PUBLIC_SERVICE_SECRET,
        audience: webEnvironment.PUBLIC_SERVICE_AUDIENCE,
      }
    : undefined;
