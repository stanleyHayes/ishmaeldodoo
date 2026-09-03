import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicContentClient } from "./public-content-client";

export const getPublicContent = createPublicContentClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  timeoutMilliseconds: webEnvironment.PUBLIC_API_TIMEOUT_MS,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
