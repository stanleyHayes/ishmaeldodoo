import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicSpeakingClient } from "./public-speaking-client";

export const getPublicSpeaking = createPublicSpeakingClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
