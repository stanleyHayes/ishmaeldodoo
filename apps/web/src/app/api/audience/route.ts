import { NextResponse } from "next/server";
import {
  audienceCookieName,
  audienceKey,
  audienceMaxAgeSeconds,
} from "../../../lib/audience/adaptive-dossier";
import { safeReturnPath } from "../../../lib/i18n/locale";

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const audience = audienceKey(url.searchParams.get("door"));
  const destination = new URL(
    safeReturnPath(url.searchParams.get("return")),
    url.origin,
  );
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(audienceCookieName, audience ?? "", {
    httpOnly: false,
    maxAge: audience ? audienceMaxAgeSeconds : 0,
    path: "/",
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
