import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicAtlasClient } from "./public-atlas-client";
export const getPublicAtlas = createPublicAtlasClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  timeoutMilliseconds: webEnvironment.PUBLIC_API_TIMEOUT_MS,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
