import type { NestExpressApplication } from "@nestjs/platform-express";

export const requestBodyLimits = Object.freeze({
  json: "32kb",
  urlencoded: "16kb",
});

export function configureRequestBodyLimits(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: requestBodyLimits.json });
  app.useBodyParser("urlencoded", {
    limit: requestBodyLimits.urlencoded,
    extended: false,
  });
}
