export const themeCookieName = "amanor-theme";
export const themeStorageName = "amanor-theme";
export const themeMaxAgeSeconds = 60 * 60 * 24 * 365;

export type Theme = "day" | "night";
export type ThemePreference = Theme | "auto";

export function themePreference(value: unknown): ThemePreference {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "day" || candidate === "night" ? candidate : "auto";
}

export function automaticAccraTheme(at: Date): Theme {
  const hour = at.getUTCHours();
  return hour >= 18 || hour < 6 ? "night" : "day";
}

export function resolveTheme(value: unknown, at: Date): Theme {
  const preference = themePreference(value);
  return preference === "auto" ? automaticAccraTheme(at) : preference;
}
