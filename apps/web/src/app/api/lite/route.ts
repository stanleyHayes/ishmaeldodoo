import { NextResponse } from "next/server";
import { safeReturnPath } from "../../../lib/i18n/locale";
import { liteCookieName, liteMaxAgeSeconds } from "../../../lib/lite/mode";

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const enabled = url.searchParams.get("enabled") === "1";
  const destination = new URL(
    safeReturnPath(url.searchParams.get("return")),
    url.origin,
  );
  if (enabled) destination.searchParams.set("lite", "1");
  else destination.searchParams.delete("lite");
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(liteCookieName, enabled ? "1" : "dismissed", {
    httpOnly: false,
    maxAge: liteMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
