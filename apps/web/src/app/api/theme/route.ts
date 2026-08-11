import { NextResponse } from "next/server";
import { safeReturnPath } from "../../../lib/i18n/locale";
import {
  themeCookieName,
  themeMaxAgeSeconds,
  themePreference,
} from "../../../lib/theme/night-economy";

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const preference = themePreference(url.searchParams.get("theme"));
  const destination = new URL(
    safeReturnPath(url.searchParams.get("return")),
    url.origin,
  );
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(
    themeCookieName,
    preference === "auto" ? "" : preference,
    {
      httpOnly: false,
      maxAge: preference === "auto" ? 0 : themeMaxAgeSeconds,
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
    },
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
