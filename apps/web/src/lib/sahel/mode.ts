export const sahelCookieName = "amanor-sahel";
export const sahelStorageName = "amanor-sahel";
export const sahelDismissedName = "amanor-sahel-auto-dismissed";
export const sahelMaxAgeSeconds = 60 * 60 * 24 * 30;

export function isSahelValue(value: unknown): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "1" || candidate === "sahel";
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
