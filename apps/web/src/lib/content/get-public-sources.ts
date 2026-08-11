import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicSourcesClient } from "./public-sources-client";

export const getPublicSources = createPublicSourcesClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
