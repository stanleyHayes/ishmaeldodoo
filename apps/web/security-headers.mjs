function originOf(value, fallback) {
  try {
    return new URL(value.replaceAll("{s}", "a")).origin;
  } catch {
    return fallback;
  }
}

export function publicSecurityHeaders(environment = process.env) {
  const tileOrigin = originOf(
    environment.LEAFLET_TILE_URL ?? "",
    "https://*.tile.openstreetmap.org",
  );
  const production =
    environment.NODE_ENV === "production" ||
    environment.AMANOR_DEPLOYMENT_ENV === "production";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: https://res.cloudinary.com ${tileOrigin}`,
    "media-src 'self' https://res.cloudinary.com",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ];

  return [
    { key: "Content-Security-Policy", value: directives.join("; ") },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];
}
