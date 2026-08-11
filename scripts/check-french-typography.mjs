import { readFile } from "node:fs/promises";

const clients = new Map([
  ["apps/web/src/lib/content/public-archive-client.ts", "locale"],
  ["apps/web/src/lib/content/public-atlas-client.ts", "locale"],
  ["apps/web/src/lib/content/public-content-client.ts", "input.locale"],
  ["apps/web/src/lib/content/public-media-client.ts", "locale"],
  ["apps/web/src/lib/content/public-signal-client.ts", "locale"],
  ["apps/web/src/lib/content/public-sources-client.ts", "input.locale"],
  ["apps/web/src/lib/content/public-speaking-client.ts", "locale"],
]);

function validateClient(path, source, localeExpression) {
  if (!source.includes('from "../i18n/french-typography"'))
    throw new Error(`${path} does not import the French typography boundary`);
  if (!source.includes(`typographyForLocale(parsed.data, ${localeExpression})`))
    throw new Error(`${path} does not normalize its validated projection`);
}

for (const [path, localeExpression] of clients) {
  const source = await readFile(path, "utf8");
  validateClient(path, source, localeExpression);
  try {
    validateClient(
      path,
      source.replace("typographyForLocale(parsed.data", "parsed.data && ("),
      localeExpression,
    );
    throw new Error(`${path} removal fixture unexpectedly passed`);
  } catch (error) {
    if (error.message === `${path} removal fixture unexpectedly passed`)
      throw error;
  }
}

console.log(
  `French typography is enforced after validation in all ${clients.size} public projection clients; removal fixtures failed closed.`,
);
