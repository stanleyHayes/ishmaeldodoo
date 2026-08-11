import { NextResponse } from "next/server";
import { analyticsConsentCookie } from "../../../../lib/analytics";

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  if (url.origin !== request.headers.get("origin"))
    return new NextResponse(null, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    granted?: unknown;
  } | null;
  if (typeof body?.granted !== "boolean")
    return new NextResponse(null, { status: 400 });
  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
  response.cookies.set(
    analyticsConsentCookie,
    body.granted ? "granted" : "denied",
    {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
    },
  );
  return response;
}
