import { plainToInstance } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  isEmail,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

export class EnvironmentVariables {
  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4000;

  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  ADMIN_ORIGIN = "http://localhost:3001";

  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  PUBLIC_WEB_ORIGIN = "http://localhost:3000";

  @IsOptional()
  @IsString()
  MONGODB_URI?: string;

  @IsIn(["true", "false"])
  ROOM_ENABLED = "false";

  @IsOptional()
  @IsString()
  ROOM_MONGODB_URI?: string;

  /**
   * The Room's pinned trust anchor and step-up policy. Declared here because
   * `validate` is what populates `process.env`: an undeclared variable is
   * silently dropped and would read as unset everywhere. Their shape is
   * enforced by `RoomConfigService`, which fails the channel closed rather than
   * failing the whole API to boot.
   */
  @IsOptional()
  @IsString()
  ROOM_TRUST_ANCHOR_KEY_ID?: string;

  @IsOptional()
  @IsString()
  ROOM_TRUST_ANCHOR_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  ROOM_REQUIRED_AMR?: string;

  @IsIn(["true", "false"])
  RUN_MIGRATIONS = "true";

  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  JWT_ISSUER?: string;

  @IsOptional()
  @IsString()
  JWT_AUDIENCE?: string;

  @IsOptional()
  @IsString()
  JWT_KEY_ID?: string;

  @IsOptional()
  @IsString()
  JWT_PRIVATE_KEY_PEM?: string;

  @IsOptional()
  @IsString()
  JWT_PUBLIC_KEY_PEM?: string;

  @IsOptional()
  @IsString()
  JWT_VERIFICATION_KEYS?: string;

  @IsOptional()
  @IsString()
  SESSION_PEPPER?: string;

  @IsOptional()
  @IsString()
  SESSION_RETIRING_PEPPERS?: string;

  @IsOptional()
  @IsString()
  MFA_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  MFA_RETIRING_ENCRYPTION_KEYS?: string;

  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  WEB_REVALIDATION_URL?: string;

  @IsOptional()
  @IsString()
  REVALIDATION_WEBHOOK_KEYS?: string;

  @IsOptional() @IsString() REVALIDATION_ACTIVE_KEY_ID?: string;
  @IsString() REVALIDATION_AUDIENCE = "amanor-public-web";

  @IsOptional()
  @IsString()
  PUBLIC_WEB_SERVICE_KEYS?: string;

  @IsString()
  PUBLIC_WEB_SERVICE_AUDIENCE = "amanor-public-api";

  @IsInt()
  @Min(0)
  @Max(2)
  TRUST_PROXY_HOPS = 0;

  @IsOptional()
  @IsString()
  @MinLength(32)
  RATE_LIMIT_PEPPER?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  @IsOptional() @IsString() RESEND_API_KEY?: string;
  @IsOptional() @IsString() @MaxLength(320) EMAIL_FROM?: string;
  @IsOptional() @IsString() PROTOCOL_DECISION_DERIVATION_KEY?: string;
  @IsOptional()
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
    require_tld: false,
  })
  CALENDAR_API_URL?: string;
  @IsOptional() @IsString() @MinLength(32) CALENDAR_API_TOKEN?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) CALENDAR_ID?: string;
  @IsOptional() @IsEmail() PRESS_CONTACT_EMAIL?: string;
  @IsOptional() @IsEmail() GENERAL_CONTACT_EMAIL?: string;
  @IsOptional() @IsString() CHROME_EXECUTABLE_PATH?: string;
  @IsOptional() @IsString() API_TLS_PRIVATE_KEY_PEM?: string;
  @IsOptional() @IsString() API_TLS_CERTIFICATE_PEM?: string;
  @IsOptional() @IsString() @MinLength(32) METRICS_BEARER_TOKEN?: string;
  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
  @IsOptional() @IsString() OTEL_TRACE_SAMPLE_RATIO?: string;
  @IsIn(["true", "false"])
  WEBAUTHN_ENABLED = "false";
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  WEBAUTHN_RP_ID?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  WEBAUTHN_RP_NAME?: string;
  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  WEBAUTHN_ORIGIN?: string;
  @IsIn(["true", "false"])
  CHROME_NO_SANDBOX = "false";
}

export function validateEnvironment(
  configuration: Record<string, unknown>,
): EnvironmentVariables {
  const normalized = {
    ...configuration,
    RUN_MIGRATIONS:
      configuration.RUN_MIGRATIONS ??
      (configuration.NODE_ENV === "production" ? "false" : "true"),
    ...(configuration.PORT === undefined
      ? {}
      : { PORT: Number(configuration.PORT) }),
    ...(configuration.TRUST_PROXY_HOPS === undefined
      ? {}
      : { TRUST_PROXY_HOPS: Number(configuration.TRUST_PROXY_HOPS) }),
  };
  const validated = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });
  if (errors.length > 0) {
    throw new Error(
      `Invalid API environment: ${errors.map((error) => error.toString()).join("; ")}`,
    );
  }
  if (
    validated.OTEL_TRACE_SAMPLE_RATIO !== undefined &&
    (!/^0(?:\.\d+)?$|^1(?:\.0+)?$/u.test(validated.OTEL_TRACE_SAMPLE_RATIO) ||
      Number(validated.OTEL_TRACE_SAMPLE_RATIO) < 0 ||
      Number(validated.OTEL_TRACE_SAMPLE_RATIO) > 1)
  ) {
    throw new Error(
      "Invalid API environment: OTEL_TRACE_SAMPLE_RATIO must be between 0 and 1",
    );
  }
  if (validated.WEBAUTHN_ENABLED === "true") {
    if (
      !validated.WEBAUTHN_RP_ID ||
      !validated.WEBAUTHN_RP_NAME ||
      !validated.WEBAUTHN_ORIGIN
    )
      throw new Error(
        "WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME and WEBAUTHN_ORIGIN are required when WebAuthn is enabled",
      );
    if (
      !/^(?:localhost|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/u.test(
        validated.WEBAUTHN_RP_ID,
      )
    )
      throw new Error("WEBAUTHN_RP_ID is invalid");
    const webAuthnOrigin = new URL(validated.WEBAUTHN_ORIGIN);
    const adminOrigin = new URL(validated.ADMIN_ORIGIN);
    if (webAuthnOrigin.origin !== adminOrigin.origin)
      throw new Error("WEBAUTHN_ORIGIN must exactly match ADMIN_ORIGIN");
    if (
      webAuthnOrigin.hostname !== validated.WEBAUTHN_RP_ID &&
      !webAuthnOrigin.hostname.endsWith(`.${validated.WEBAUTHN_RP_ID}`)
    )
      throw new Error("WEBAUTHN_RP_ID must contain the Admin origin hostname");
    if (
      validated.NODE_ENV === "production" &&
      webAuthnOrigin.protocol !== "https:"
    )
      throw new Error("WEBAUTHN_ORIGIN must use HTTPS in production");
  }
  if (validated.EMAIL_FROM && !emailMailboxAddress(validated.EMAIL_FROM)) {
    throw new Error(
      "Invalid API environment: EMAIL_FROM must be a bare email or a safe display name followed by <email>",
    );
  }
  const calendarValues = [
    validated.CALENDAR_API_URL,
    validated.CALENDAR_API_TOKEN,
    validated.CALENDAR_ID,
  ];
  if (calendarValues.some(Boolean) && !calendarValues.every(Boolean)) {
    throw new Error(
      "CALENDAR_API_URL, CALENDAR_API_TOKEN and CALENDAR_ID must be configured together",
    );
  }
  if (validated.NODE_ENV === "production" && !validated.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in production");
  }
  if (validated.ROOM_ENABLED === "true") {
    if (!validated.MONGODB_URI || !validated.ROOM_MONGODB_URI) {
      throw new Error(
        "MONGODB_URI and ROOM_MONGODB_URI are required when The Room is enabled",
      );
    }
    assertSeparateRoomDatabaseIdentity(
      validated.MONGODB_URI,
      validated.ROOM_MONGODB_URI,
    );
  }
  if (
    validated.NODE_ENV === "production" &&
    validated.RUN_MIGRATIONS !== "false"
  ) {
    throw new Error(
      "RUN_MIGRATIONS must be false in production; use the one-shot migration command",
    );
  }
  if (validated.NODE_ENV === "production") {
    for (const key of [
      "JWT_ISSUER",
      "JWT_AUDIENCE",
      "JWT_KEY_ID",
      "JWT_PRIVATE_KEY_PEM",
      "JWT_PUBLIC_KEY_PEM",
      "JWT_VERIFICATION_KEYS",
      "SESSION_PEPPER",
      "MFA_ENCRYPTION_KEY",
      "WEB_REVALIDATION_URL",
      "REVALIDATION_WEBHOOK_KEYS",
      "REVALIDATION_ACTIVE_KEY_ID",
      "PUBLIC_WEB_SERVICE_KEYS",
      "RATE_LIMIT_PEPPER",
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "PROTOCOL_DECISION_DERIVATION_KEY",
      "PRESS_CONTACT_EMAIL",
      "GENERAL_CONTACT_EMAIL",
      "CALENDAR_API_URL",
      "CALENDAR_API_TOKEN",
      "CALENDAR_ID",
      "CHROME_EXECUTABLE_PATH",
      "METRICS_BEARER_TOKEN",
    ] as const) {
      if (!validated[key]) throw new Error(`${key} is required in production`);
    }
  }
  if (
    Boolean(validated.API_TLS_PRIVATE_KEY_PEM) !==
    Boolean(validated.API_TLS_CERTIFICATE_PEM)
  ) {
    throw new Error(
      "API TLS private key and certificate must be configured together",
    );
  }
  if (validated.PUBLIC_WEB_SERVICE_KEYS) {
    try {
      const keys = JSON.parse(validated.PUBLIC_WEB_SERVICE_KEYS) as Record<
        string,
        unknown
      >;
      if (
        Object.keys(keys).length < 1 ||
        Object.entries(keys).some(
          ([key, value]) =>
            !key || typeof value !== "string" || value.length < 32,
        )
      )
        throw new Error();
    } catch {
      throw new Error(
        "PUBLIC_WEB_SERVICE_KEYS must be a JSON object of key IDs to secrets of at least 32 characters",
      );
    }
  }
  if (validated.JWT_VERIFICATION_KEYS) {
    try {
      const keys = JSON.parse(validated.JWT_VERIFICATION_KEYS) as Record<
        string,
        unknown
      >;
      if (
        !validated.JWT_KEY_ID ||
        typeof keys[validated.JWT_KEY_ID] !== "string" ||
        Object.keys(keys).length > 3 ||
        Object.entries(keys).some(
          ([key, value]) =>
            !key ||
            typeof value !== "string" ||
            !value.includes("BEGIN PUBLIC KEY"),
        )
      )
        throw new Error();
    } catch {
      throw new Error(
        "JWT_VERIFICATION_KEYS must contain the active key and at most two retiring ES256 public keys",
      );
    }
  }
  if (validated.SESSION_RETIRING_PEPPERS) {
    try {
      const peppers = JSON.parse(validated.SESSION_RETIRING_PEPPERS) as unknown;
      if (
        !Array.isArray(peppers) ||
        peppers.length > 2 ||
        peppers.some(
          (pepper) => typeof pepper !== "string" || pepper.length < 32,
        ) ||
        new Set(peppers).size !== peppers.length ||
        peppers.includes(validated.SESSION_PEPPER)
      )
        throw new Error();
    } catch {
      throw new Error(
        "SESSION_RETIRING_PEPPERS must be a JSON array of at most two unique prior peppers of at least 32 characters",
      );
    }
  }
  const validMfaKey = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))
      return false;
    return Buffer.from(value, "base64").length === 32;
  };
  if (
    validated.PROTOCOL_DECISION_DERIVATION_KEY &&
    !validMfaKey(validated.PROTOCOL_DECISION_DERIVATION_KEY)
  )
    throw new Error(
      "PROTOCOL_DECISION_DERIVATION_KEY must be 32 bytes encoded as base64",
    );
  if (
    validated.MFA_ENCRYPTION_KEY &&
    !validMfaKey(validated.MFA_ENCRYPTION_KEY)
  )
    throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  if (validated.MFA_RETIRING_ENCRYPTION_KEYS) {
    try {
      const keys = JSON.parse(
        validated.MFA_RETIRING_ENCRYPTION_KEYS,
      ) as unknown;
      if (
        !Array.isArray(keys) ||
        keys.length > 2 ||
        keys.some((key) => !validMfaKey(key)) ||
        new Set(keys).size !== keys.length ||
        keys.includes(validated.MFA_ENCRYPTION_KEY)
      )
        throw new Error();
    } catch {
      throw new Error(
        "MFA_RETIRING_ENCRYPTION_KEYS must be a JSON array of at most two unique prior 32-byte base64 keys",
      );
    }
  }
  if (validated.REVALIDATION_WEBHOOK_KEYS) {
    try {
      const keys = JSON.parse(validated.REVALIDATION_WEBHOOK_KEYS) as Record<
        string,
        unknown
      >;
      if (
        !validated.REVALIDATION_ACTIVE_KEY_ID ||
        typeof keys[validated.REVALIDATION_ACTIVE_KEY_ID] !== "string" ||
        Object.entries(keys).some(
          ([key, value]) =>
            !key || typeof value !== "string" || value.length < 32,
        )
      )
        throw new Error();
    } catch {
      throw new Error(
        "REVALIDATION_WEBHOOK_KEYS must contain the active key and secrets of at least 32 characters",
      );
    }
  }
  return validated;
}

export function emailMailboxAddress(value: string): string | undefined {
  const trimmed = value.trim();
  if (
    !trimmed ||
    [...trimmed].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return undefined;
  let address = trimmed;
  if (trimmed.includes("<") || trimmed.includes(">")) {
    const named = /^([^<>]{1,100})\s+<([^<>]+)>$/u.exec(trimmed);
    if (!named || !named[1]?.trim()) return undefined;
    address = named[2]!.trim();
  }
  return isEmail(address, { allow_utf8_local_part: false })
    ? address.toLowerCase()
    : undefined;
}

function assertSeparateRoomDatabaseIdentity(
  applicationUri: string,
  roomUri: string,
): void {
  let application: URL;
  let room: URL;
  try {
    application = new URL(applicationUri);
    room = new URL(roomUri);
  } catch {
    throw new Error("MongoDB connection values must be valid URIs");
  }
  const databaseName = (uri: URL): string => uri.pathname.replace(/^\//u, "");
  if (!application.username || !room.username) {
    throw new Error(
      "The Room and application MongoDB connections require explicit database users",
    );
  }
  if (application.username === room.username) {
    throw new Error("The Room must use a distinct MongoDB user");
  }
  if (!databaseName(application) || !databaseName(room)) {
    throw new Error(
      "The Room and application MongoDB connections require explicit databases",
    );
  }
  if (databaseName(application) === databaseName(room)) {
    throw new Error("The Room must use a distinct MongoDB database");
  }
}
