import "server-only";
import { z } from "zod";

const webEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  AMANOR_DEPLOYMENT_ENV: z
    .enum(["local", "preview", "staging", "production"])
    .default("local"),
  PUBLIC_API_BASE_URL: z.url().default("http://localhost:4000/v1"),
  PUBLIC_WEB_BASE_URL: z.url().default("http://localhost:3000"),
  REVALIDATION_WEBHOOK_KEYS: z.string().optional(),
  REVALIDATION_AUDIENCE: z.string().min(1).default("amanor-public-web"),
  PUBLIC_SERVICE_KEY_ID: z.string().min(1).optional(),
  PUBLIC_SERVICE_SECRET: z.string().min(32).optional(),
  PUBLIC_SERVICE_AUDIENCE: z.string().min(1).default("amanor-public-api"),
  PUBLIC_INDEXING_ENABLED: z.enum(["true", "false"]).default("false"),
  LEAFLET_TILE_URL: z
    .url()
    .default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  LEAFLET_TILE_ATTRIBUTION: z
    .string()
    .min(1)
    .default("© OpenStreetMap contributors"),
});

export const webEnvironment = webEnvironmentSchema
  .superRefine((value, context) => {
    if (
      value.AMANOR_DEPLOYMENT_ENV === "production" &&
      !value.REVALIDATION_WEBHOOK_KEYS
    ) {
      context.addIssue({
        code: "custom",
        message: "Revalidation key ring is required in production",
      });
    }
    if (value.REVALIDATION_WEBHOOK_KEYS) {
      try {
        const keys = JSON.parse(value.REVALIDATION_WEBHOOK_KEYS) as Record<
          string,
          unknown
        >;
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
      Boolean(value.PUBLIC_SERVICE_KEY_ID) !==
      Boolean(value.PUBLIC_SERVICE_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "PUBLIC_SERVICE_KEY_ID and PUBLIC_SERVICE_SECRET must be configured together",
      });
    }
    if (
      value.AMANOR_DEPLOYMENT_ENV === "production" &&
      (!value.PUBLIC_SERVICE_KEY_ID || !value.PUBLIC_SERVICE_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        message: "Public API service authentication is required in production",
      });
    }
  })
  .parse(process.env);

export const publicServiceAuth =
  webEnvironment.PUBLIC_SERVICE_KEY_ID && webEnvironment.PUBLIC_SERVICE_SECRET
    ? {
        keyId: webEnvironment.PUBLIC_SERVICE_KEY_ID,
        secret: webEnvironment.PUBLIC_SERVICE_SECRET,
        audience: webEnvironment.PUBLIC_SERVICE_AUDIENCE,
      }
    : undefined;
