/** Serialize JSON-LD for an inline script without permitting an HTML end tag. */
export function structuredDataJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
