import type { ConfigService } from "@nestjs/config";

export function mfaEncryptionKeys(
  configuration: ConfigService,
): readonly [string, ...string[]] {
  const active = configuration.getOrThrow<string>("MFA_ENCRYPTION_KEY");
  const retiringValue = configuration.get<string>(
    "MFA_RETIRING_ENCRYPTION_KEYS",
  );
  const retiring = retiringValue
    ? (JSON.parse(retiringValue) as readonly string[])
    : [];
  return [active, ...retiring];
}
