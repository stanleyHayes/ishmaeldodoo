import { parseAdminEnvironment } from "./environment.mjs";

export function adminSecurityHeaders(environment = process.env) {
  const { apiOrigin, deploymentEnvironment } =
    parseAdminEnvironment(environment);
  const production =
    environment.NODE_ENV === "production" ||
    deploymentEnvironment === "production";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    `connect-src 'self' ${apiOrigin} https://api.cloudinary.com`,
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
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cache-Control", value: "private, no-store" },
  ];
}
