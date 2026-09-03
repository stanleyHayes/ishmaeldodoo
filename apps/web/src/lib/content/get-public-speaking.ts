import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicSpeakingClient } from "./public-speaking-client";

export const getPublicSpeaking = createPublicSpeakingClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  timeoutMilliseconds: webEnvironment.PUBLIC_API_TIMEOUT_MS,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
