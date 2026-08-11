import { type NextRequest, NextResponse } from "next/server";
import {
  localeCookieName,
  localeFromPathname,
  preferredLocale,
} from "./lib/i18n/locale";
import {
  isSahelValue,
  sahelCookieName,
  sahelMaxAgeSeconds,
} from "./lib/sahel/mode";
import {
  resolveTheme,
  themeCookieName,
  themePreference,
} from "./lib/theme/night-economy";

const oneYearInSeconds = 60 * 60 * 24 * 365;

function sahelNoScriptPolicy(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https://res.cloudinary.com",
    "media-src 'self' https://res.cloudinary.com",
    "connect-src 'self'",
    "worker-src 'none'",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "production"
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
}

function persistLocale(response: NextResponse, locale: "en-GB" | "fr-FR") {
  response.cookies.set(localeCookieName, locale, {
    httpOnly: true,
    maxAge: oneYearInSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const storedLocale = request.cookies.get(localeCookieName)?.value;
  const querySahel =
    isSahelValue(request.nextUrl.searchParams.get("lite")) ||
    isSahelValue(request.nextUrl.searchParams.get("mode"));
  const queryCameFromNavigation =
    request.headers.get("rsc") !== "1" &&
    request.headers.get("next-router-prefetch") !== "1";
  const storedSahel = request.cookies.get(sahelCookieName)?.value;
  const sahelDismissed = storedSahel === "dismissed";
  const sahelActive =
    querySahel || (!sahelDismissed && isSahelValue(storedSahel));
  const storedTheme = request.cookies.get(themeCookieName)?.value;
  const resolvedTheme = resolveTheme(storedTheme, new Date());
  const resolvedThemePreference = themePreference(storedTheme);

  if (
    sahelActive &&
    (pathname === "/record/atlas" || pathname === "/fr/record/atlas") &&
    request.nextUrl.searchParams.get("map") !== "1"
  ) {
    const destination = request.nextUrl.clone();
    destination.pathname = `${pathname}/table`;
    destination.searchParams.set("lite", "1");
    destination.searchParams.delete("mode");
    const response = NextResponse.redirect(destination);
    if (querySahel && queryCameFromNavigation) {
      response.cookies.set(sahelCookieName, "1", {
        httpOnly: false,
        maxAge: sahelMaxAgeSeconds,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    response.headers.append("Vary", "Cookie");
    return response;
  }

  if (
    pathname === "/" &&
    storedLocale !== "en-GB" &&
    storedLocale !== "fr-FR"
  ) {
    const negotiatedLocale = preferredLocale(
      request.headers.get("accept-language"),
    );
    if (negotiatedLocale === "fr-FR") {
      const response = NextResponse.redirect(new URL("/fr", request.url));
      persistLocale(response, negotiatedLocale);
      response.headers.append("Vary", "Accept-Language, Cookie");
      return response;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-amanor-locale", localeFromPathname(pathname));
  requestHeaders.set("x-amanor-pathname", pathname);
  requestHeaders.set("x-amanor-sahel", sahelActive ? "1" : "0");
  requestHeaders.set("x-amanor-theme", resolvedTheme);
  requestHeaders.set("x-amanor-theme-preference", resolvedThemePreference);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (sahelActive && ["/", "/fr", "/press", "/fr/press"].includes(pathname)) {
    response.headers.set("Content-Security-Policy", sahelNoScriptPolicy());
  }
  if (querySahel && queryCameFromNavigation) {
    response.cookies.set(sahelCookieName, "1", {
      httpOnly: false,
      maxAge: sahelMaxAgeSeconds,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  response.headers.append("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2)$).*)",
  ],
};
