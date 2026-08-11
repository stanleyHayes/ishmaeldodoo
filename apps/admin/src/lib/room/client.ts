import {
  roomCiphertextSchema,
  roomDesignationStateSchema,
  roomInboxPageSchema,
  roomReceiptSchema,
  type RoomCiphertext,
  type RoomDesignationState,
  type RoomEnquiryState,
  type RoomExtension,
  type RoomInboxPage,
} from "@amanor/contracts";
import { ApiClientError } from "../api/client";
import { clearAuthState, getAuthState, setAuthState } from "../api/auth-store";
import { adminApiBaseUrl } from "../env";

/**
 * A deliberately separate, minimal client for The Room.
 *
 * It shares the in-memory token store with the CMS client but not the module:
 * the threat model calls for dedicated minimal bundles on Room routes, and
 * importing the full CMS client would pull the entire editorial, media and Desk
 * surface into the same bundle as decrypted content.
 *
 * Nothing here logs, caches or persists a response.
 */

let refreshInFlight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  const current = getAuthState();
  if (!current) {
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  }
  const response = await fetch(`${adminApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": current.csrfToken },
  });
  if (!response.ok) {
    clearAuthState();
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  }
  const body = (await response.json()) as { accessToken?: unknown };
  if (typeof body.accessToken !== "string") {
    clearAuthState();
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  }
  setAuthState({ accessToken: body.accessToken, csrfToken: current.csrfToken });
}

async function ensureRefreshed(): Promise<void> {
  refreshInFlight ??= refresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function roomRequest(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<unknown> {
  const current = getAuthState();
  if (!current) {
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${current.accessToken}`);
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    headers.set("X-CSRF-Token", current.csrfToken);
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${adminApiBaseUrl()}/room${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401 && retry) {
    await ensureRefreshed();
    return roomRequest(path, init, false);
  }
  if (!response.ok) {
    // The API answers every Room denial identically; the client keeps it that
    // way rather than inferring a more specific reason from the status.
    throw new ApiClientError(
      response.status === 403 || response.status === 404
        ? "Room access is not permitted"
        : "The Room request failed",
      response.status,
      "ROOM_REQUEST_FAILED",
    );
  }
  return response.json();
}

export async function listRoomInbox(): Promise<RoomInboxPage> {
  return roomInboxPageSchema.parse(await roomRequest("/enquiries"));
}

export async function fetchRoomCiphertext(
  reference: string,
): Promise<RoomCiphertext> {
  return roomCiphertextSchema.parse(
    await roomRequest(`/enquiries/${encodeURIComponent(reference)}/ciphertext`),
  );
}

export async function setRoomEnquiryState(
  reference: string,
  state: RoomEnquiryState,
): Promise<void> {
  await roomRequest(`/enquiries/${encodeURIComponent(reference)}/state`, {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export async function extendRoomRetention(
  reference: string,
  extension: RoomExtension,
): Promise<string> {
  const receipt = roomReceiptSchema.parse(
    await roomRequest(`/enquiries/${encodeURIComponent(reference)}/extension`, {
      method: "POST",
      body: JSON.stringify(extension),
    }),
  );
  return receipt.deleteAfter;
}

export async function getRoomDesignation(): Promise<RoomDesignationState> {
  return roomDesignationStateSchema.parse(await roomRequest("/designation"));
}

export async function grantRoomDesignation(
  input: Readonly<{ userId: string; expiresAt: string }>,
): Promise<RoomDesignationState> {
  return roomDesignationStateSchema.parse(
    await roomRequest("/designation", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function revokeRoomDesignation(): Promise<RoomDesignationState> {
  return roomDesignationStateSchema.parse(
    await roomRequest("/designation", { method: "DELETE" }),
  );
}
