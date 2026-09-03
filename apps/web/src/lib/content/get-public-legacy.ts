import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicLegacyClient } from "./public-legacy-client";

export const getPublicLegacy = createPublicLegacyClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  timeoutMilliseconds: webEnvironment.PUBLIC_API_TIMEOUT_MS,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
