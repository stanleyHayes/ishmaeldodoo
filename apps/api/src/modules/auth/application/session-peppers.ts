import type { ConfigService } from "@nestjs/config";

export function sessionPeppers(
  configuration: ConfigService,
): readonly [string, ...string[]] {
  const active = configuration.getOrThrow<string>("SESSION_PEPPER");
  const retiringValue = configuration.get<string>("SESSION_RETIRING_PEPPERS");
  const retiring = retiringValue
    ? (JSON.parse(retiringValue) as readonly string[])
    : [];
  return [active, ...retiring];
}
