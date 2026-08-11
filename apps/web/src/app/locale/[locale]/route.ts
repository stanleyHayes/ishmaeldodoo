import { type NextRequest, NextResponse } from "next/server";
import {
  localeCookieName,
  localizePath,
  safeReturnPath,
  supportedLocales,
} from "../../../lib/i18n/locale";

const oneYearInSeconds = 60 * 60 * 24 * 365;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await context.params;
  const locale = supportedLocales.find((candidate) => candidate === rawLocale);
  if (!locale)
    return NextResponse.json({ error: "Unsupported locale" }, { status: 404 });

  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
  const destination = new URL(localizePath(returnTo, locale), request.url);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(localeCookieName, locale, {
    httpOnly: true,
    maxAge: oneYearInSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
