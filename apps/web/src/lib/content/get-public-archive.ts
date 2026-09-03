import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicArchiveClient } from "./public-archive-client";

export const getPublicArchive = createPublicArchiveClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  timeoutMilliseconds: webEnvironment.PUBLIC_API_TIMEOUT_MS,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
