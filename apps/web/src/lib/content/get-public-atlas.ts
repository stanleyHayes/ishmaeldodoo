import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicAtlasClient } from "./public-atlas-client";
export const getPublicAtlas = createPublicAtlasClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
