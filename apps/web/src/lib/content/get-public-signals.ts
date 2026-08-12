import "server-only";
import { publicServiceAuth, webEnvironment } from "../env";
import { createPublicSignalsClient } from "./public-signals-client";

export const getPublicSignals = createPublicSignalsClient({
  baseUrl: webEnvironment.PUBLIC_API_BASE_URL,
  ...(publicServiceAuth ? { serviceAuth: publicServiceAuth } : {}),
});
