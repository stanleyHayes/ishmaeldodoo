import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicSignalClient } from "./public-signal-client";

export const getPublicSignal = createPublicSignalClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  timeoutMilliseconds: webEnvironment.PUBLIC_API_TIMEOUT_MS,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
