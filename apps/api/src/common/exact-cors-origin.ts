export type CorsOriginCallback = (
  error: Error | null,
  allowed?: boolean,
) => void;

/**
 * Do not use the CORS package's fixed string mode: it emits the trusted origin
 * even when a request presents a different Origin and relies on the browser to
 * reject the mismatch. This callback emits CORS permission only for one exact
 * configured Admin origin. Origin-less service traffic receives no browser
 * permission header and continues through the ordinary HTTP boundary.
 */
export function exactCorsOrigin(
  allowedOrigin: string,
): (origin: string | undefined, callback: CorsOriginCallback) => void {
  return (origin, callback) => callback(null, origin === allowedOrigin);
}
