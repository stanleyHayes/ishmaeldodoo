import { NextResponse } from "next/server";
import {
  analyticsEventSchema,
  hasAnalyticsConsent,
} from "../../../lib/analytics";
import { webEnvironment } from "../../../lib/env";

const noContent = (): NextResponse =>
  new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request): Promise<NextResponse> {
  if (new URL(request.url).origin !== request.headers.get("origin"))
    return new NextResponse(null, { status: 403 });
  if (!hasAnalyticsConsent(request.headers.get("cookie"))) return noContent();
  if (Number(request.headers.get("content-length") ?? "0") > 2048)
    return new NextResponse(null, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 2048)
    return new NextResponse(null, { status: 413 });
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    // Invalid JSON is handled by the schema below.
  }
  const parsed = analyticsEventSchema.safeParse(payload);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const endpoint = webEnvironment.ANALYTICS_EVENT_ENDPOINT;
  const domain = webEnvironment.ANALYTICS_SITE_ID;
  if (!endpoint || !domain) return noContent();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AMANOR analytics proxy",
        },
        body: JSON.stringify({
          domain,
          name: parsed.data.name,
          url: new URL(parsed.data.route, request.url).toString(),
          props: {
            locale: parsed.data.locale,
            ...(parsed.data.audience ? { audience: parsed.data.audience } : {}),
            ...(parsed.data.mode ? { mode: parsed.data.mode } : {}),
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      }).catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve();
        }, 1_500);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return noContent();
}
