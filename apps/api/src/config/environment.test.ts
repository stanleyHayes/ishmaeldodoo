import { describe, expect, it } from "vitest";
import { emailMailboxAddress, validateEnvironment } from "./environment";

describe("API environment", () => {
  it("uses safe local defaults", () => {
    expect(validateEnvironment({})).toEqual(
      expect.objectContaining({
        PORT: 4000,
        ADMIN_ORIGIN: "http://localhost:3001",
      }),
    );
  });

  it("requires MongoDB in production and validates exact origins", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        ADMIN_ORIGIN: "https://admin.example.test",
        PUBLIC_WEB_ORIGIN: "https://www.example.test",
      }),
    ).toThrow(/MONGODB_URI/i);
    expect(() =>
      validateEnvironment({ ADMIN_ORIGIN: "not-an-origin" }),
    ).toThrow(/environment/i);
    for (const ADMIN_ORIGIN of [
      "http://admin.example.test",
      "https://user:password@admin.example.test",
      "https://admin.example.test/path",
      "https://admin.example.test?token=value",
    ])
      expect(() => validateEnvironment({ ADMIN_ORIGIN })).toThrow(
        /origin|HTTPS/u,
      );
    expect(() =>
      validateEnvironment({
        ADMIN_ORIGIN: "https://amanor.example.test",
        PUBLIC_WEB_ORIGIN: "https://amanor.example.test",
      }),
    ).toThrow(/distinct/u);
  });

  it("runs migrations locally but forbids API-bootstrap migrations in production", () => {
    expect(validateEnvironment({ NODE_ENV: "test" }).RUN_MIGRATIONS).toBe(
      "true",
    );
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb://database.example/amanor",
        RUN_MIGRATIONS: "true",
        ADMIN_ORIGIN: "https://admin.example.test",
        PUBLIC_WEB_ORIGIN: "https://www.example.test",
      }),
    ).toThrow(/one-shot migration command/i);
  });

  it("requires a distinct database identity before The Room can be enabled", () => {
    const application =
      "mongodb://amanor_app:password@database.example/amanor?authSource=admin";
    const room =
      "mongodb://amanor_room:password@database.example/amanor_room?authSource=admin";
    expect(
      validateEnvironment({
        MONGODB_URI: application,
        ROOM_ENABLED: "true",
        ROOM_MONGODB_URI: room,
      }),
    ).toEqual(
      expect.objectContaining({
        ROOM_ENABLED: "true",
        ROOM_MONGODB_URI: room,
      }),
    );
    expect(() =>
      validateEnvironment({ MONGODB_URI: application, ROOM_ENABLED: "true" }),
    ).toThrow(/required when The Room is enabled/u);
    expect(() =>
      validateEnvironment({
        MONGODB_URI: application,
        ROOM_ENABLED: "true",
        ROOM_MONGODB_URI:
          "mongodb://amanor_app:other@database.example/amanor_room",
      }),
    ).toThrow(/distinct MongoDB user/u);
    expect(() =>
      validateEnvironment({
        MONGODB_URI: application,
        ROOM_ENABLED: "true",
        ROOM_MONGODB_URI:
          "mongodb://amanor_room:password@database.example/amanor",
      }),
    ).toThrow(/distinct MongoDB database/u);
  });

  it("requires direct TLS key material to be configured as a pair", () => {
    expect(() =>
      validateEnvironment({ API_TLS_PRIVATE_KEY_PEM: "private-key" }),
    ).toThrow(/configured together/i);
    expect(() =>
      validateEnvironment({ API_TLS_CERTIFICATE_PEM: "certificate" }),
    ).toThrow(/configured together/i);
    expect(
      validateEnvironment({
        API_TLS_PRIVATE_KEY_PEM: "private-key",
        API_TLS_CERTIFICATE_PEM: "certificate",
      }),
    ).toEqual(
      expect.objectContaining({
        API_TLS_PRIVATE_KEY_PEM: "private-key",
        API_TLS_CERTIFICATE_PEM: "certificate",
      }),
    );
  });

  it("bounds optional OTLP trace sampling and validates the collector endpoint", () => {
    expect(
      validateEnvironment({
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
          "https://collector.example.test/v1/traces",
        OTEL_TRACE_SAMPLE_RATIO: "0.25",
      }),
    ).toEqual(expect.objectContaining({ OTEL_TRACE_SAMPLE_RATIO: "0.25" }));
    for (const ratio of ["-0.1", "1.1", "NaN", "25"]) {
      expect(() =>
        validateEnvironment({ OTEL_TRACE_SAMPLE_RATIO: ratio }),
      ).toThrow(/between 0 and 1/u);
    }
    expect(() =>
      validateEnvironment({
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "file:///tmp/traces",
      }),
    ).toThrow(/environment/u);
  });

  it("accepts safe bare and named sender mailboxes but rejects injection and malformed names", () => {
    expect(emailMailboxAddress("desk@mail.example.org")).toBe(
      "desk@mail.example.org",
    );
    expect(emailMailboxAddress("Project AMANOR <Desk@Mail.Example.Org>")).toBe(
      "desk@mail.example.org",
    );
    expect(
      validateEnvironment({
        EMAIL_FROM: "Project AMANOR <desk@mail.example.org>",
      }).EMAIL_FROM,
    ).toBe("Project AMANOR <desk@mail.example.org>");
    for (const unsafe of [
      "Project AMANOR <not-an-email>",
      "<desk@mail.example.org>",
      "Project <desk@mail.example.org> trailing",
      "Project AMANOR\r\nBcc: attacker@example.org <desk@mail.example.org>",
    ]) {
      expect(emailMailboxAddress(unsafe)).toBeUndefined();
      expect(() => validateEnvironment({ EMAIL_FROM: unsafe })).toThrow(
        /EMAIL_FROM/u,
      );
    }
  });

  it("requires a 32-byte base64 Protocol decision derivation key", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    expect(
      validateEnvironment({ PROTOCOL_DECISION_DERIVATION_KEY: key }),
    ).toEqual(
      expect.objectContaining({ PROTOCOL_DECISION_DERIVATION_KEY: key }),
    );
    expect(() =>
      validateEnvironment({ PROTOCOL_DECISION_DERIVATION_KEY: "too-short" }),
    ).toThrow(/PROTOCOL_DECISION_DERIVATION_KEY/u);
  });

  it("requires the calendar adapter configuration as one complete secret set", () => {
    const configured = {
      CALENDAR_API_URL: "https://calendar-adapter.example.test/events",
      CALENDAR_API_TOKEN: "calendar-token-with-at-least-thirty-two-bytes",
      CALENDAR_ID: "principal-calendar",
    };
    expect(validateEnvironment(configured)).toEqual(
      expect.objectContaining(configured),
    );
    for (const key of Object.keys(configured)) {
      const incomplete = { ...configured };
      delete incomplete[key as keyof typeof incomplete];
      expect(() => validateEnvironment(incomplete)).toThrow(
        /must be configured together/u,
      );
    }
    expect(() =>
      validateEnvironment({ ...configured, CALENDAR_API_URL: "http://unsafe" }),
    ).toThrow(/environment/u);
    for (const CALENDAR_API_URL of [
      "https://operator:secret@calendar.example.test/events",
      "https://calendar.example.test:8443/events",
      "https://calendar.example.test/events?token=secret",
      "https://calendar.example.test/events#fragment",
    ])
      expect(() =>
        validateEnvironment({ ...configured, CALENDAR_API_URL }),
      ).toThrow(/prohibited URL parts/u);
  });

  it("binds revalidation delivery to the exact public Web endpoint", () => {
    expect(
      validateEnvironment({
        PUBLIC_WEB_ORIGIN: "https://www.example.test",
        WEB_REVALIDATION_URL: "https://www.example.test/api/revalidate",
      }).WEB_REVALIDATION_URL,
    ).toBe("https://www.example.test/api/revalidate");
    for (const WEB_REVALIDATION_URL of [
      "https://other.example.test/api/revalidate",
      "https://www.example.test/other",
      "https://operator:secret@www.example.test/api/revalidate",
      "https://www.example.test/api/revalidate?token=secret",
    ])
      expect(() =>
        validateEnvironment({
          PUBLIC_WEB_ORIGIN: "https://www.example.test",
          WEB_REVALIDATION_URL,
        }),
      ).toThrow(/PUBLIC_WEB_ORIGIN|prohibited URL parts/u);
  });

  it("permits a port only on loopback revalidation origins", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "development",
        PUBLIC_WEB_ORIGIN: "http://localhost:3000",
        WEB_REVALIDATION_URL: "http://localhost:3000/api/revalidate",
      }).WEB_REVALIDATION_URL,
    ).toBe("http://localhost:3000/api/revalidate");
    expect(() =>
      validateEnvironment({
        PUBLIC_WEB_ORIGIN: "https://www.example.test",
        WEB_REVALIDATION_URL: "https://www.example.test:8443/api/revalidate",
      }),
    ).toThrow(/prohibited URL parts/u);
  });

  it("validates rotatable service and revalidation key rings", () => {
    const secret = "a-service-secret-with-at-least-thirty-two-bytes";
    expect(
      validateEnvironment({
        PUBLIC_WEB_SERVICE_KEYS: JSON.stringify({
          current: secret,
          previous: `${secret}-previous`,
        }),
        REVALIDATION_WEBHOOK_KEYS: JSON.stringify({
          current: secret,
          previous: `${secret}-previous`,
        }),
        REVALIDATION_ACTIVE_KEY_ID: "current",
      }),
    ).toEqual(
      expect.objectContaining({ REVALIDATION_ACTIVE_KEY_ID: "current" }),
    );
    expect(() =>
      validateEnvironment({ PUBLIC_WEB_SERVICE_KEYS: "not-json" }),
    ).toThrow(/PUBLIC_WEB_SERVICE_KEYS/u);
    expect(() =>
      validateEnvironment({
        PUBLIC_WEB_SERVICE_KEYS: JSON.stringify({ current: "short" }),
      }),
    ).toThrow(/PUBLIC_WEB_SERVICE_KEYS/u);
    expect(() =>
      validateEnvironment({
        REVALIDATION_WEBHOOK_KEYS: "not-json",
        REVALIDATION_ACTIVE_KEY_ID: "current",
      }),
    ).toThrow(/REVALIDATION_WEBHOOK_KEYS/u);
    expect(() =>
      validateEnvironment({
        REVALIDATION_WEBHOOK_KEYS: JSON.stringify({ previous: secret }),
        REVALIDATION_ACTIVE_KEY_ID: "current",
      }),
    ).toThrow(/active key/u);
  });

  it("bounds the JWT verification ring and requires the active key", () => {
    const publicKey =
      "-----BEGIN PUBLIC KEY-----\\nmock-key-material\\n-----END PUBLIC KEY-----";
    expect(
      validateEnvironment({
        JWT_KEY_ID: "current",
        JWT_VERIFICATION_KEYS: JSON.stringify({
          current: publicKey,
          retiring: publicKey,
        }),
      }),
    ).toEqual(expect.objectContaining({ JWT_KEY_ID: "current" }));
    expect(() =>
      validateEnvironment({
        JWT_KEY_ID: "current",
        JWT_VERIFICATION_KEYS: JSON.stringify({ retiring: publicKey }),
      }),
    ).toThrow(/active key/u);
    expect(() =>
      validateEnvironment({
        JWT_KEY_ID: "current",
        JWT_VERIFICATION_KEYS: JSON.stringify({
          current: publicKey,
          old1: publicKey,
          old2: publicKey,
          old3: publicKey,
        }),
      }),
    ).toThrow(/at most two retiring/u);
  });

  it("bounds retiring session peppers and rejects active-key duplication", () => {
    const active = "active-session-pepper-with-at-least-32-characters";
    const retiring = "retiring-session-pepper-with-at-least-32-characters";
    expect(
      validateEnvironment({
        SESSION_PEPPER: active,
        SESSION_RETIRING_PEPPERS: JSON.stringify([retiring]),
      }),
    ).toEqual(expect.objectContaining({ SESSION_PEPPER: active }));
    expect(() =>
      validateEnvironment({
        SESSION_PEPPER: active,
        SESSION_RETIRING_PEPPERS: JSON.stringify([active]),
      }),
    ).toThrow(/unique prior peppers/u);
    expect(() =>
      validateEnvironment({
        SESSION_PEPPER: active,
        SESSION_RETIRING_PEPPERS: JSON.stringify([
          retiring,
          `${retiring}-2`,
          `${retiring}-3`,
        ]),
      }),
    ).toThrow(/at most two/u);
  });

  it("validates the active and bounded retiring MFA encryption keys", () => {
    const active = Buffer.alloc(32, 1).toString("base64");
    const retiring = Buffer.alloc(32, 2).toString("base64");
    expect(
      validateEnvironment({
        MFA_ENCRYPTION_KEY: active,
        MFA_RETIRING_ENCRYPTION_KEYS: JSON.stringify([retiring]),
      }),
    ).toEqual(expect.objectContaining({ MFA_ENCRYPTION_KEY: active }));
    expect(() =>
      validateEnvironment({ MFA_ENCRYPTION_KEY: "not-a-32-byte-key" }),
    ).toThrow(/32 bytes/u);
    expect(() =>
      validateEnvironment({
        MFA_ENCRYPTION_KEY: active,
        MFA_RETIRING_ENCRYPTION_KEYS: JSON.stringify([active]),
      }),
    ).toThrow(/unique prior/u);
  });
});
