import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ROOM_ENVELOPE_SUITE,
  type RoomEnvelope,
  type RoomKeyManifest,
} from "@amanor/contracts";
import { RoomAuditService } from "./application/room-audit.service";
import { httpMetrics } from "../../common/http-metrics";
import { RoomConfigService } from "./application/room-config";
import {
  RoomDesignationRejectedError,
  RoomDesignationService,
} from "./application/room-designation.service";
import {
  RoomEnquiryNotFoundError,
  RoomEnquiryService,
  RoomSubmissionRejectedError,
} from "./application/room-enquiry.service";
import {
  RoomKeyManifestService,
  RoomManifestUnavailableError,
} from "./application/room-key-manifest.service";
import { RoomRetentionService } from "./application/room-retention.service";
import { RoomAccessGuard } from "./http/room-access.guard";
import { RoomEnquiryRepository } from "./persistence/room-enquiry.repository";
import type { RoomRepository } from "./persistence/room.repository";
import type { RoomCollectionName } from "./persistence/room-database.constants";

/* ------------------------------------------------------------------ */
/* An in-memory stand-in for the Room collections. It mirrors the real  */
/* privilege boundary: `room_events` and `room_key_manifests` reject     */
/* updates, because the Room credential holds no update grant on them.   */
/* ------------------------------------------------------------------ */

type Document = Record<string, unknown>;

function matches(document: Document, filter: Document): boolean {
  return Object.entries(filter).every(([path, condition]) => {
    const value = path
      .split(".")
      .reduce<unknown>(
        (current, segment) =>
          current && typeof current === "object"
            ? (current as Document)[segment]
            : undefined,
        document,
      );
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date)
    ) {
      return Object.entries(condition as Document).every(
        ([operator, operand]) => {
          switch (operator) {
            case "$ne":
              return value !== operand;
            case "$in":
              return (operand as unknown[]).includes(value);
            case "$lt":
              return (value as number) < (operand as number);
            case "$lte":
              return (value as Date) <= (operand as Date);
            case "$exists":
              return (value !== undefined) === operand;
            default:
              throw new Error(`Unsupported operator ${operator}`);
          }
        },
      );
    }
    return value === condition;
  });
}

function applyUpdate(document: Document, update: Document): void {
  for (const [path, value] of Object.entries((update.$set as Document) ?? {})) {
    const segments = path.split(".");
    let target = document;
    for (const segment of segments.slice(0, -1)) {
      target[segment] ??= {};
      target = target[segment] as Document;
    }
    target[segments.at(-1)!] = value;
  }
  for (const [path, amount] of Object.entries(
    (update.$inc as Document) ?? {},
  )) {
    const segments = path.split(".");
    let target = document;
    for (const segment of segments.slice(0, -1)) {
      target[segment] ??= {};
      target = target[segment] as Document;
    }
    const last = segments.at(-1)!;
    target[last] = ((target[last] as number) ?? 0) + (amount as number);
  }
  for (const path of Object.keys((update.$unset as Document) ?? {})) {
    delete document[path];
  }
}

class FakeCollection {
  readonly documents: Document[] = [];
  readonly unique = new Set<string>();

  constructor(private readonly appendOnly: boolean) {}

  insertOne(document: Document): Promise<void> {
    for (const field of this.unique) {
      if (
        document[field] !== undefined &&
        this.documents.some((existing) => existing[field] === document[field])
      ) {
        throw new Error("E11000 duplicate key error");
      }
    }
    this.documents.push(structuredClone(document));
    return Promise.resolve();
  }

  findOne(filter: Document): Promise<Document | null> {
    return Promise.resolve(
      this.documents.find((document) => matches(document, filter)) ?? null,
    );
  }

  find(filter: Document) {
    let results = this.documents.filter((document) =>
      matches(document, filter),
    );
    const cursor = {
      sort: (specification: Record<string, 1 | -1>) => {
        const [[field, direction]] = Object.entries(specification) as [
          [string, 1 | -1],
        ];
        results = [...results].sort((left, right) => {
          const a = left[field] as number | Date;
          const b = right[field] as number | Date;
          return (a < b ? -1 : a > b ? 1 : 0) * direction;
        });
        return cursor;
      },
      limit: (count: number) => {
        results = results.slice(0, count);
        return cursor;
      },
      toArray: () => Promise.resolve(results),
      next: () => Promise.resolve(results[0] ?? null),
    };
    return cursor;
  }

  countDocuments(filter: Document): Promise<number> {
    return Promise.resolve(
      this.documents.filter((document) => matches(document, filter)).length,
    );
  }

  updateOne(
    filter: Document,
    update: Document,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    if (this.appendOnly) throw new Error("not authorized on room_events");
    const document = this.documents.find((candidate) =>
      matches(candidate, filter),
    );
    if (!document)
      return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
    applyUpdate(document, update);
    return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
  }

  updateMany(
    filter: Document,
    update: Document,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    if (this.appendOnly) throw new Error("not authorized on room_events");
    const documents = this.documents.filter((candidate) =>
      matches(candidate, filter),
    );
    for (const document of documents) applyUpdate(document, update);
    return Promise.resolve({
      matchedCount: documents.length,
      modifiedCount: documents.length,
    });
  }

  createIndexes(
    definitions: readonly { key: Document; unique?: boolean }[],
  ): Promise<void> {
    for (const definition of definitions) {
      if (definition.unique) {
        for (const field of Object.keys(definition.key)) this.unique.add(field);
      }
    }
    return Promise.resolve();
  }
}

class FakeRoomRepository {
  readonly collections: Record<RoomCollectionName, FakeCollection> = {
    room_enquiries: new FakeCollection(false),
    // Append-only in production: find and insert grants only.
    room_events: new FakeCollection(true),
    room_key_manifests: new FakeCollection(true),
  };

  collection(name: RoomCollectionName) {
    return this.collections[name] as never;
  }
}

/* ------------------------------------------------------------------ */

const envelope: RoomEnvelope = {
  envelopeVersion: 1,
  suite: ROOM_ENVELOPE_SUITE,
  envelopeId: "0123456789abcdef0123456789abcdef",
  recipientKeyId: "rk-principal-2026",
  keyEpoch: 3,
  ephemeralPublicKey: "A".repeat(87),
  nonce: "B".repeat(16),
  ciphertext: "C".repeat(200),
};

const submission = {
  envelope,
  locale: "en-GB" as const,
  confidentialityAcknowledged: true as const,
  procurementAcknowledged: true as const,
};

const now = new Date("2026-08-10T12:00:00.000Z");

let room: FakeRoomRepository;
let repository: RoomEnquiryRepository;
let audit: RoomAuditService;
let service: RoomEnquiryService;

beforeEach(async () => {
  httpMetrics.reset();
  room = new FakeRoomRepository();
  repository = new RoomEnquiryRepository(room as unknown as RoomRepository);
  await repository.onApplicationBootstrap();
  audit = new RoomAuditService(repository);
  service = new RoomEnquiryService(repository, audit);
});

describe("Room ingress", () => {
  it("stores ciphertext and purpose-limited metadata only", async () => {
    const receipt = await service.accept(submission, now);

    expect(receipt.reference).toMatch(/^RM-2026-[A-Z2-7]{16}$/u);
    expect(receipt.deleteAfter).toBe("2027-02-06T12:00:00.000Z");

    const [stored] = room.collections.room_enquiries.documents;
    expect(Object.keys(stored!).sort()).toEqual(
      [
        "ciphertextBytes",
        "ciphertextDigest",
        "deleteAfter",
        "deletion",
        "envelope",
        "envelopeId",
        "extensionCount",
        "keyEpoch",
        "locale",
        "receivedAt",
        "recipientKeyId",
        "reference",
        "state",
      ].sort(),
    );
  });

  it("issues unpredictable, non-sequential references", async () => {
    const first = await service.accept(submission, now);
    const second = await service.accept(
      { ...submission, envelope: { ...envelope, envelopeId: "f".repeat(32) } },
      now,
    );
    expect(first.reference).not.toBe(second.reference);
  });

  it("records a metadata-only receipt event carrying no content", async () => {
    const receipt = await service.accept(submission, now);
    const [event] = room.collections.room_events.documents;
    expect(event).toEqual({
      action: "room_enquiry_received",
      actorId: null,
      reference: receipt.reference,
      keyId: "rk-principal-2026",
      reasonCategory: null,
      occurredAt: now,
    });
  });

  it("treats an identical resubmission as a retry, not a duplicate", async () => {
    const first = await service.accept(submission, now);
    const retry = await service.accept(submission, now);

    expect(retry.reference).toBe(first.reference);
    expect(room.collections.room_enquiries.documents).toHaveLength(1);
    expect(room.collections.room_events.documents).toHaveLength(1);
  });

  it("rejects a replayed envelope identifier carrying different ciphertext", async () => {
    await service.accept(submission, now);
    await expect(
      service.accept(
        {
          ...submission,
          envelope: { ...envelope, ciphertext: "D".repeat(200) },
        },
        now,
      ),
    ).rejects.toBeInstanceOf(RoomSubmissionRejectedError);
    expect(room.collections.room_enquiries.documents).toHaveLength(1);
  });

  it.each([
    ["an unknown suite", { suite: "AES-128-CBC" }],
    ["a truncated ephemeral key", { ephemeralPublicKey: "A".repeat(40) }],
    ["an oversized ciphertext", { ciphertext: "C".repeat(12_001) }],
  ])("rejects %s without storing anything", async (_label, override) => {
    await expect(
      service.accept(
        { ...submission, envelope: { ...envelope, ...override } },
        now,
      ),
    ).rejects.toBeInstanceOf(RoomSubmissionRejectedError);
    expect(room.collections.room_enquiries.documents).toHaveLength(0);
  });

  it("refuses a submission missing the procurement acknowledgement", async () => {
    await expect(
      service.accept({ ...submission, procurementAcknowledged: false }, now),
    ).rejects.toBeInstanceOf(RoomSubmissionRejectedError);
  });

  it("gives every structural rejection the same message", async () => {
    const messages = new Set<string>();
    for (const bad of [
      { ...submission, envelope: { ...envelope, suite: "x" } },
      { ...submission, locale: "de-DE" },
      {},
    ]) {
      await service
        .accept(bad, now)
        .catch((error: Error) => messages.add(error.message));
    }
    expect(messages.size).toBe(1);
  });
});

describe("Room ciphertext release", () => {
  it("records the release before returning ciphertext", async () => {
    const receipt = await service.accept(submission, now);
    const released = await service.release(receipt.reference, "user-1", now);

    expect(released.envelope).toEqual(envelope);
    expect(room.collections.room_events.documents.at(-1)).toMatchObject({
      action: "room_ciphertext_released",
      actorId: "user-1",
      reference: receipt.reference,
    });
  });

  it("fails closed and releases nothing when the audit store is unavailable", async () => {
    const receipt = await service.accept(submission, now);
    vi.spyOn(repository, "appendEvent").mockRejectedValueOnce(
      new Error("audit unavailable"),
    );
    await expect(
      service.release(receipt.reference, "user-1", now),
    ).rejects.toThrow(/audit unavailable/iu);
  });

  it("hides an item that is past its deletion deadline", async () => {
    const receipt = await service.accept(submission, now);
    await expect(
      service.release(
        receipt.reference,
        "user-1",
        new Date("2027-03-01T00:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(RoomEnquiryNotFoundError);
  });

  it("marks a first read without a second state change", async () => {
    const receipt = await service.accept(submission, now);
    await service.release(receipt.reference, "user-1", now);
    expect(room.collections.room_enquiries.documents[0]!.state).toBe("read");
  });
});

describe("Room retention", () => {
  it("extends by an explicit reasoned amount and records the category only", async () => {
    const receipt = await service.accept(submission, now);
    const extended = await service.extend(
      receipt.reference,
      { reason: "legal_hold", days: 30 },
      "user-1",
      now,
    );

    expect(extended.deleteAfter).toBe("2027-03-08T12:00:00.000Z");
    expect(room.collections.room_events.documents.at(-1)).toMatchObject({
      action: "room_retention_extended",
      reasonCategory: "legal_hold",
    });
  });

  it("caps extensions at the approved count", async () => {
    const receipt = await service.accept(submission, now);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await service.extend(
        receipt.reference,
        { reason: "active_conversation", days: 30 },
        "user-1",
        now,
      );
    }
    await expect(
      service.extend(
        receipt.reference,
        { reason: "active_conversation", days: 30 },
        "user-1",
        now,
      ),
    ).rejects.toBeInstanceOf(RoomEnquiryNotFoundError);
  });

  it("deletes expired ciphertext and leaves content-free evidence", async () => {
    const receipt = await service.accept(submission, now);
    const retention = new RoomRetentionService(repository, audit, {
      enabled: true,
    } as never);

    const outcome = await retention.drain(new Date("2027-03-01T00:00:00.000Z"));

    expect(outcome).toEqual({ scanned: 1, deleted: 1, failed: 0 });
    const [stored] = room.collections.room_enquiries.documents;
    expect(stored).not.toHaveProperty("envelope");
    expect(stored).not.toHaveProperty("locale");
    expect(stored).not.toHaveProperty("recipientKeyId");
    expect(stored!.reference).toBe(receipt.reference);
    expect(room.collections.room_events.documents.at(-1)).toMatchObject({
      action: "room_enquiry_deleted",
      reference: receipt.reference,
    });
    const metrics = httpMetrics.render();
    expect(metrics).toContain("amanor_room_retention_due 0");
    expect(metrics).toContain("amanor_room_retention_failed 0");
    expect(metrics).toContain("amanor_room_retention_scan_healthy 1");
    expect(metrics).not.toContain(receipt.reference);
  });

  it("leaves a failed deletion visible as a non-zero aggregate", async () => {
    await service.accept(submission, now);
    const retention = new RoomRetentionService(repository, audit, {
      enabled: true,
    } as never);
    vi.spyOn(repository, "deleteEnquiry").mockRejectedValueOnce(
      new Error("write failed"),
    );

    const outcome = await retention.drain(new Date("2027-03-01T00:00:00.000Z"));

    expect(outcome).toMatchObject({ deleted: 0, failed: 1 });
    expect(room.collections.room_enquiries.documents[0]).toHaveProperty(
      "envelope",
    );
    const metrics = httpMetrics.render();
    expect(metrics).toContain("amanor_room_retention_due 1");
    expect(metrics).toContain("amanor_room_retention_failed 1");
    expect(metrics).toMatch(
      /amanor_room_retention_oldest_overdue_seconds [1-9][0-9]*/u,
    );
    expect(metrics).not.toContain(
      room.collections.room_enquiries.documents[0]!.reference as string,
    );
  });

  it("marks a failed aggregate scan unhealthy without leaking a reference", async () => {
    const receipt = await service.accept(submission, now);
    const retention = new RoomRetentionService(repository, audit, {
      enabled: true,
    } as never);
    vi.spyOn(repository, "findExpired").mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(retention.drain(now)).rejects.toThrow(/unavailable/u);
    const metrics = httpMetrics.render();
    expect(metrics).toContain("amanor_room_retention_scan_healthy 0");
    expect(metrics).not.toContain(receipt.reference);
  });

  it("does not resurrect an already-deleted item in the inbox", async () => {
    await service.accept(submission, now);
    const retention = new RoomRetentionService(repository, audit, {
      enabled: true,
    } as never);
    await retention.drain(new Date("2027-03-01T00:00:00.000Z"));

    expect((await service.inbox()).items).toHaveLength(0);
  });
});

describe("Room designation", () => {
  let designations: RoomDesignationService;

  beforeEach(() => {
    designations = new RoomDesignationService(
      room as unknown as RoomRepository,
    );
  });

  it("grants exactly one designate", async () => {
    await designations.grant(
      { userId: "designate-1", expiresAt: new Date("2026-09-10T00:00:00Z") },
      "principal-1",
      now,
    );
    await expect(
      designations.grant(
        { userId: "designate-2", expiresAt: new Date("2026-09-10T00:00:00Z") },
        "principal-1",
        now,
      ),
    ).rejects.toBeInstanceOf(RoomDesignationRejectedError);
  });

  it("refuses self-designation", async () => {
    await expect(
      designations.grant(
        { userId: "principal-1", expiresAt: new Date("2026-09-10T00:00:00Z") },
        "principal-1",
        now,
      ),
    ).rejects.toThrow(/granting actor/iu);
  });

  it("refuses a grant that has already expired", async () => {
    await expect(
      designations.grant(
        { userId: "designate-1", expiresAt: new Date("2026-08-01T00:00:00Z") },
        "principal-1",
        now,
      ),
    ).rejects.toThrow(/expire in the future/iu);
  });

  it("expires a designation without any write", async () => {
    await designations.grant(
      { userId: "designate-1", expiresAt: new Date("2026-09-10T00:00:00Z") },
      "principal-1",
      now,
    );
    expect(await designations.isDesignate("designate-1", now)).toBe(true);
    expect(
      await designations.isDesignate(
        "designate-1",
        new Date("2026-09-11T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("revokes by appending, never by mutating the event log", async () => {
    await designations.grant(
      { userId: "designate-1", expiresAt: new Date("2026-09-10T00:00:00Z") },
      "principal-1",
      now,
    );
    const state = await designations.revoke(
      "principal-1",
      new Date("2026-08-11T00:00:00Z"),
    );

    expect(state.designate).toBeNull();
    expect(room.collections.room_events.documents).toHaveLength(2);
    expect(
      await designations.isDesignate(
        "designate-1",
        new Date("2026-08-12T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("allows a fresh designation after revocation", async () => {
    await designations.grant(
      { userId: "designate-1", expiresAt: new Date("2026-09-10T00:00:00Z") },
      "principal-1",
      now,
    );
    await designations.revoke("principal-1", new Date("2026-08-11T00:00:00Z"));
    await expect(
      designations.grant(
        { userId: "designate-2", expiresAt: new Date("2026-09-10T00:00:00Z") },
        "principal-1",
        new Date("2026-08-12T00:00:00Z"),
      ),
    ).resolves.toMatchObject({ designate: { userId: "designate-2" } });
  });
});

describe("Room authentication-method configuration", () => {
  const base = {
    ROOM_TRUST_ANCHOR_KEY_ID: "ta-room-2026",
    ROOM_TRUST_ANCHOR_PUBLIC_KEY: "A".repeat(87),
  };

  it("defaults closed to the supported hardware-key method", () => {
    expect(new RoomConfigService().readFrom(base).read()).toMatchObject({
      requiredAuthenticationMethods: ["hwk"],
    });
  });

  it.each(["pwd,webauthn", "hwk,hwk", " , "])(
    "rejects unsupported, duplicate or empty method configuration: %s",
    (configured) => {
      expect(() =>
        new RoomConfigService()
          .readFrom({ ...base, ROOM_REQUIRED_AMR: configured })
          .read(),
      ).toThrow(/unique supported authentication methods/u);
    },
  );
});

describe("Room access guard", () => {
  const configuration = {
    read: () => ({
      trustAnchorKeyId: "ta-room-2026",
      trustAnchorPublicKey: "A".repeat(87),
      requiredAuthenticationMethods: ["hwk"],
    }),
  } as unknown as RoomConfigService;

  const context = (auth: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ auth }) }),
    }) as never;

  let guard: RoomAccessGuard;
  let designations: RoomDesignationService;

  beforeEach(() => {
    designations = new RoomDesignationService(
      room as unknown as RoomRepository,
    );
    guard = new RoomAccessGuard(configuration, designations, audit);
  });

  it("admits the Principal presenting the required factor", async () => {
    await expect(
      guard.canActivate(
        context({
          subject: "principal-1",
          roles: ["principal"],
          authenticationMethods: ["pwd", "hwk"],
        }),
      ),
    ).resolves.toBe(true);
  });

  it.each([
    ["desk_officer"],
    ["editor"],
    ["translator"],
    ["reviewer"],
    ["press_officer"],
    ["trust_admin"],
    ["security_admin"],
  ])("denies %s even with the required factor", async (role) => {
    await expect(
      guard.canActivate(
        context({
          subject: `${role}-1`,
          roles: [role],
          authenticationMethods: ["pwd", "hwk"],
        }),
      ),
    ).rejects.toThrow(/not permitted/iu);
  });

  it("denies the Principal without the required factor", async () => {
    await expect(
      guard.canActivate(
        context({
          subject: "principal-1",
          roles: ["principal"],
          authenticationMethods: ["pwd", "totp"],
        }),
      ),
    ).rejects.toThrow(/not permitted/iu);
  });

  it("admits an active designate and refuses them once revoked", async () => {
    await designations.grant(
      { userId: "designate-1", expiresAt: new Date("2099-01-01T00:00:00Z") },
      "principal-1",
      now,
    );
    const request = context({
      subject: "designate-1",
      roles: ["desk_officer"],
      authenticationMethods: ["pwd", "hwk"],
    });
    await expect(guard.canActivate(request)).resolves.toBe(true);

    await designations.revoke("principal-1", new Date("2026-08-11T00:00:00Z"));
    await expect(guard.canActivate(request)).rejects.toThrow(/not permitted/iu);
  });

  it("records a metadata-only denial event", async () => {
    await guard
      .canActivate(
        context({
          subject: "editor-1",
          roles: ["editor"],
          authenticationMethods: ["pwd", "hwk"],
        }),
      )
      .catch(() => undefined);

    expect(room.collections.room_events.documents.at(-1)).toMatchObject({
      action: "room_access_denied",
      actorId: "editor-1",
      reference: null,
    });
  });
});

describe("Room key manifest service", () => {
  const configuration = {
    read: () => ({
      trustAnchorKeyId: "ta-room-2026",
      trustAnchorPublicKey: "A".repeat(87),
      requiredAuthenticationMethods: ["hwk"],
    }),
  } as unknown as RoomConfigService;

  it("reports unavailable when no manifest is published", async () => {
    const manifests = new RoomKeyManifestService(repository, configuration);
    await expect(manifests.current(now)).rejects.toBeInstanceOf(
      RoomManifestUnavailableError,
    );
  });

  it("refuses to serve a manifest that does not verify, without saying why", async () => {
    await room.collections.room_key_manifests.insertOne({
      manifestId: "m-1",
      active: true,
      publishedAt: now,
      manifest: {
        manifestVersion: 1,
        issuedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
        keys: [
          {
            keyId: "rk-principal-2026",
            epoch: 3,
            algorithm: "ECDH-P256",
            purpose: "room-enquiry",
            publicKey: "B".repeat(87),
            notBefore: "2026-08-01T00:00:00.000Z",
            notAfter: "2027-08-01T00:00:00.000Z",
            status: "active",
          },
        ],
        signature: {
          algorithm: "ECDSA-P256-SHA256",
          keyId: "ta-room-2026",
          value: "C".repeat(86),
        },
      } satisfies RoomKeyManifest,
    });

    const manifests = new RoomKeyManifestService(repository, configuration);
    await expect(manifests.current(now)).rejects.toBeInstanceOf(
      RoomManifestUnavailableError,
    );
  });

  it("offers no way for the API to publish a key", () => {
    expect(repository).not.toHaveProperty("publishManifest");
  });
});
