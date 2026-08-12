import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicLegacyClient } from "./public-legacy-client";

export const getPublicLegacy = createPublicLegacyClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
