import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { revalidationRequestSchema } from "@amanor/contracts";
import { webEnvironment } from "@/lib/env";
import { verifyRevalidationSignature } from "@/lib/revalidation/signature";
import { claimRevalidation } from "@/lib/revalidation/claim";

const maximumClockSkewMilliseconds = 5 * 60 * 1_000;
const replayWindow = new Map<string, number>();

export async function POST(request: Request): Promise<NextResponse> {
  const encodedKeys = webEnvironment.REVALIDATION_WEBHOOK_KEYS;
  if (!encodedKeys)
    return NextResponse.json(
      { message: "Revalidation is not configured" },
      { status: 503 },
    );
  const timestamp = request.headers.get("x-amanor-timestamp") ?? "";
  const keyId = request.headers.get("x-amanor-key-id") ?? "";
  const audience = request.headers.get("x-amanor-audience") ?? "";
  const signature = request.headers.get("x-amanor-signature") ?? "";
  const timestampMilliseconds = Number(timestamp);
  const now = Date.now();
  if (
    !Number.isFinite(timestampMilliseconds) ||
    Math.abs(now - timestampMilliseconds) > maximumClockSkewMilliseconds
  ) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  const keys = JSON.parse(encodedKeys) as Record<string, string>;
  const secret = keys[keyId];
  if (
    audience !== webEnvironment.REVALIDATION_AUDIENCE ||
    !secret ||
    !verifyRevalidationSignature(
      keyId,
      audience,
      timestamp,
      rawBody,
      signature,
      secret,
    )
  ) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  const parsed = revalidationRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });

  for (const [key, expiresAt] of replayWindow)
    if (expiresAt <= now) replayWindow.delete(key);
  if (replayWindow.has(parsed.data.idempotencyKey)) {
    return NextResponse.json({ message: "Replay rejected" }, { status: 409 });
  }
  try {
    for (const tag of parsed.data.tags) revalidateTag(tag, "max");
  } catch {
    return NextResponse.json(
      { message: "Revalidation is temporarily unavailable" },
      { status: 503 },
    );
  }

  // Cache invalidation is idempotent. Claim only after it succeeds so a
  // transient invalidation failure remains retryable instead of becoming a
  // permanent replay.
  const sharedClaim = await claimRevalidation(parsed.data.idempotencyKey);
  if (sharedClaim === "replayed")
    return NextResponse.json({ message: "Replay rejected" }, { status: 409 });
  if (sharedClaim === "unavailable")
    return NextResponse.json(
      { message: "Replay protection is unavailable" },
      { status: 503 },
    );
  replayWindow.set(
    parsed.data.idempotencyKey,
    now + maximumClockSkewMilliseconds,
  );
  return NextResponse.json({ revalidated: parsed.data.tags.length });
}
