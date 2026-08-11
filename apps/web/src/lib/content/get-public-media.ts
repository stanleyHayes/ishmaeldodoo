import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicMediaClient } from "./public-media-client";

export const getPublicMedia = createPublicMediaClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
