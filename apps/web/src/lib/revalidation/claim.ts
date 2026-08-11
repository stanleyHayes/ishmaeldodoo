import { publicServiceAuth, webEnvironment } from "../env";
import { serviceAuthHeaders } from "../service-auth";

export async function claimRevalidation(
  idempotencyKey: string,
): Promise<"claimed" | "replayed" | "unavailable"> {
  if (!publicServiceAuth)
    return webEnvironment.AMANOR_DEPLOYMENT_ENV === "production"
      ? "unavailable"
      : "claimed";
  const baseUrl = webEnvironment.PUBLIC_API_BASE_URL.replace(/\/$/u, "");
  const url = new URL(
    `${baseUrl}/internal/revalidation/claims/${encodeURIComponent(idempotencyKey)}`,
  );
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: serviceAuthHeaders(url, publicServiceAuth, "POST"),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status === 409) return "replayed";
    return response.status === 201 ? "claimed" : "unavailable";
  } catch {
    return "unavailable";
  }
}
