export const liteCookieName = "amanor-lite";
export const liteStorageName = "amanor-lite";
export const liteDismissedName = "amanor-lite-auto-dismissed";
export const liteMaxAgeSeconds = 60 * 60 * 24 * 30;

export function isLiteValue(value: unknown): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "1" || candidate === "lite";
}

export function isConstrainedConnection(connection: unknown): boolean {
  if (!connection || typeof connection !== "object") return false;
  const candidate = connection as {
    saveData?: unknown;
    effectiveType?: unknown;
  };
  return (
    candidate.saveData === true ||
    candidate.effectiveType === "2g" ||
    candidate.effectiveType === "slow-2g"
  );
}
