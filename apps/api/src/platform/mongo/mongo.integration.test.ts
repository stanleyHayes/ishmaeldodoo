import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Session } from "../../modules/auth/domain/session";
import { AuthRepository } from "../../modules/auth/persistence/auth.repository";
import { HardwareKeyRepository } from "../../modules/auth/persistence/hardware-key.repository";
import {
  createRefreshToken,
  hashRefreshSecret,
  parseRefreshToken,
} from "../../modules/auth/domain/refresh-token";
import { rotateSession } from "../../modules/auth/application/rotate-session";
import { CmsRepository } from "../../modules/content/persistence/cms.repository";
import { CmsService } from "../../modules/content/application/cms.service";
import { materializeStructuredPublication } from "../../modules/content/persistence/structured-publication-projection";
import { RevalidationOutboxService } from "../../modules/content/application/revalidation-outbox.service";
import { RevalidationClaimRepository } from "../../modules/content/persistence/revalidation-claim.repository";
import { RateLimitService } from "../../modules/auth/application/rate-limit.service";
import { MediaRepository } from "../../modules/media/persistence/media.repository";
import { MediaRetentionService } from "../../modules/media/application/media-retention.service";
import { MediaReferenceService } from "../../modules/media/application/media-reference.service";
import { ProtocolDeskRepository } from "../../modules/protocol-desk/persistence/protocol-desk.repository";
import { ProtocolDeskOperationsService } from "../../modules/protocol-desk/application/protocol-desk-operations.service";
import { AvailabilityService } from "../../modules/protocol-desk/application/availability.service";
import { CorrespondenceWorker } from "../../modules/protocol-desk/application/correspondence.worker";
import { PrincipalDecisionDeliveryWorker } from "../../modules/protocol-desk/application/principal-decision-delivery.worker";
import { ProtocolDeskRetentionService } from "../../modules/protocol-desk/application/protocol-desk-retention.service";
import { migrations } from "./migrations/registry";
import { runMigrations } from "./migrations/runner";
import { disposableMongoUri } from "./test-mongo-uri";
import { TtlRetentionMonitorService } from "./ttl-retention-monitor.service";
import { httpMetrics } from "../../common/http-metrics";

const testUri = process.env.MONGODB_TEST_URI;
const integration = testUri ? describe : describe.skip;

integration("MongoDB replica-set integration", () => {
  const databaseName = `amanor_integration_${randomUUID().replaceAll("-", "")}`;
  const uri = testUri ? disposableMongoUri(testUri, databaseName) : "";

  beforeAll(async () => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  }, 20_000);

  afterAll(async () => {
    if (mongoose.connection.db) await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  it("reports expired personal-data records by fixed class without selecting payload fields", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const collections = [
      "contact_enquiries",
      "media_enquiries",
      "press_kit_requests",
      "living_dossier_requests",
    ];
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");
    for (const collection of collections)
      await database.collection(collection).insertOne({
        monitorFixture: true,
        expiresAt,
        email: `${collection}@must-not-appear.example`,
      });
    httpMetrics.reset();

    const result = await new TtlRetentionMonitorService(
      mongoose.connection,
    ).scan(new Date("2099-01-01T02:00:00.000Z"));

    expect(result.due).toEqual({
      general_contact: 1,
      media_enquiry: 1,
      press_kit: 1,
      living_dossier: 1,
    });
    expect(new Set(Object.values(result.oldestOverdueSeconds))).toEqual(
      new Set([7_200]),
    );
    const output = httpMetrics.render();
    expect(output).toContain(
      'amanor_personal_data_retention_due{record_class="living_dossier"} 1',
    );
    expect(output).not.toContain("must-not-appear.example");
    for (const collection of collections)
      await database
        .collection(collection)
        .deleteMany({ monitorFixture: true });
  });

  it("atomically consumes WebAuthn ceremonies, advances counters and revokes credentials", async () => {
    const repository = new HardwareKeyRepository(mongoose.connection);
    const now = new Date("2026-08-11T12:00:00.000Z");
    const registration = {
      ceremonyId: randomUUID(),
      userId: "hardware-user",
      sessionId: "hardware-session",
      purpose: "registration" as const,
      challengeHash: "registration-hash",
      expiresAt: new Date(now.getTime() + 300_000),
    };
    await repository.createCeremony(registration);
    const loadedRegistration = await repository.findCeremony(
      registration.ceremonyId,
    );
    expect(loadedRegistration?.challengeHash).toBe("registration-hash");
    const credential = {
      credentialId: "hardware-credential",
      userId: "hardware-user",
      webAuthnUserId: "hardware-user-id",
      publicKey: Buffer.from("public-key"),
      counter: 0,
      transports: ["usb"],
      deviceType: "singleDevice" as const,
      backedUp: false,
      aaguid: "00000000-0000-0000-0000-000000000000",
      label: "Office key",
    };
    await expect(
      repository.register(loadedRegistration!, credential, now),
    ).resolves.toBe(true);
    await expect(
      repository.register(
        loadedRegistration!,
        { ...credential, credentialId: "replay-credential" },
        now,
      ),
    ).resolves.toBe(false);

    const authentication = {
      ceremonyId: randomUUID(),
      userId: "hardware-user",
      sessionId: "hardware-session",
      purpose: "authentication" as const,
      challengeHash: "authentication-hash",
      expiresAt: new Date(now.getTime() + 300_000),
    };
    await repository.createCeremony(authentication);
    const loadedAuthentication = await repository.findCeremony(
      authentication.ceremonyId,
    );
    const stored = await repository.find(
      "hardware-user",
      "hardware-credential",
    );
    expect(stored?.publicKey.toString()).toBe("public-key");
    await expect(
      repository.authenticate(loadedAuthentication!, stored!, 1, now),
    ).resolves.toBe(true);
    await expect(
      repository.authenticate(loadedAuthentication!, stored!, 2, now),
    ).resolves.toBe(false);
    expect(
      (await repository.find("hardware-user", "hardware-credential"))?.counter,
    ).toBe(1);
    await expect(
      repository.revoke("hardware-user", "hardware-credential", now),
    ).resolves.toBe(true);
    await expect(
      repository.find("hardware-user", "hardware-credential"),
    ).resolves.toBeNull();
  });

  it("applies forward-only migrations once and creates required indexes", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    await database.collection("protocol_request_events").insertOne({
      eventId: "legacy-protocol-event",
      requestId: "legacy-protocol-request",
      fromState: null,
      toState: "received",
      actorId: "public-intake",
      actorRole: "system",
      reason: "Request submitted",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
    });
    const legacyConsumedHashes = Array.from({ length: 13 }, (_, index) =>
      index.toString(16).padStart(64, "0"),
    );
    await database.collection("sessions").insertOne({
      sessionId: "legacy-refresh-session",
      familyId: "legacy-refresh-family",
      userId: "legacy-user",
      roles: ["editor"],
      roleVersion: 1,
      currentRefreshHash: "f".repeat(64),
      consumedRefreshHashes: legacyConsumedHashes,
      csrfHash: "e".repeat(64),
      authenticationMethods: ["pwd", "totp"],
      createdAt: new Date("2026-08-01T00:00:00Z"),
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    await database.collection("editorial_audit").insertMany([
      {
        eventId: "legacy-editorial-1",
        documentType: "page",
        documentId: "legacy-page",
        version: 1,
        actorId: "editor-1",
        action: "created",
        occurredAt: new Date("2026-08-01T00:00:00Z"),
        metadata: { state: "draft" },
        eventHash: "legacy-hash-1",
      },
      {
        eventId: "legacy-editorial-2",
        documentType: "page",
        documentId: "legacy-page",
        version: 1,
        actorId: "editor-1",
        action: "submit",
        occurredAt: new Date("2026-08-01T00:01:00Z"),
        metadata: { state: "in_review" },
        previousEventHash: "legacy-hash-1",
        eventHash: "legacy-hash-2",
      },
    ]);
    await database.collection("identities").insertOne({
      singletonKey: "legacy-canonical",
      titleHistory: [
        {
          title: { "en-GB": "Legacy role", "fr-FR": "Fonction historique" },
          from: new Date("2020-01-01T00:00:00Z"),
          to: null,
        },
      ],
      bio40: {},
      bio120: {},
      bio300: {},
    });
    await database.collection("content_versions").insertOne({
      documentType: "identity",
      documentId: "legacy-canonical",
      version: 1,
      state: "draft",
      authorId: "legacy-editor",
      payload: {
        titleHistory: [
          {
            title: { "en-GB": "Legacy role", "fr-FR": "Fonction historique" },
            from: new Date("2020-01-01T00:00:00Z"),
            to: null,
          },
        ],
        bio40: {},
        bio120: {},
        bio300: {},
      },
    });
    await expect(runMigrations(database, migrations)).resolves.toEqual([
      "20260809_001_foundation",
      "20260809_002_rate_limits",
      "20260809_003_media_assets",
      "20260809_004_press_kit_requests",
      "20260809_005_media_enquiries",
      "20260809_006_living_dossier_requests",
      "20260809_007_protocol_desk",
      "20260810_008_revalidation_claims",
      "20260810_009_auth_invitations",
      "20260810_010_auth_audit",
      "20260810_011_auth_audit_integrity",
      "20260810_012_publication_feeds",
      "20260810_013_contact_enquiries",
      "20260810_014_media_library",
      "20260810_015_editorial_audit_integrity",
      "20260810_016_biography_sources",
      "20260810_017_protocol_correspondence",
      "20260810_018_protocol_sla",
      "20260810_019_protocol_access_audit",
      "20260810_020_refresh_token_consumptions",
      "20260810_021_content_collection_indexes",
      "20260810_022_core_content_indexes",
      "20260810_023_identity_title_history",
      "20260810_024_operational_content_indexes",
      "20260810_025_structured_publication_projections",
      "20260810_026_protocol_retention",
      "20260810_027_auth_notification_jobs",
      "20260810_028_calendar_sync_jobs",
      "20260810_029_media_retention",
      "20260810_030_protocol_decision_capabilities",
      "20260811_031_principal_decision_deliveries",
      "20260811_032_webauthn_hardware_keys",
    ]);
    await expect(runMigrations(database, migrations)).resolves.toEqual([]);
    await expect(
      database.collection("structured_projection_legacy").findOne({
        sourceCollection: "identities",
        "original.singletonKey": "legacy-canonical",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        original: expect.objectContaining({
          bio40SourceRefs: [],
          bio120SourceRefs: [],
          bio300SourceRefs: [],
          titleHistory: [
            expect.objectContaining({
              longFormTitle: {
                "en-GB": "Legacy role",
                "fr-FR": "Fonction historique",
              },
            }),
          ],
        }),
      }),
    );
    await expect(
      database.collection("content_versions").findOne({
        documentType: "identity",
        documentId: "legacy-canonical",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          bio40SourceRefs: [],
          bio120SourceRefs: [],
          bio300SourceRefs: [],
          titleHistory: [
            expect.objectContaining({
              longFormTitle: {
                "en-GB": "Legacy role",
                "fr-FR": "Fonction historique",
              },
            }),
          ],
        }),
      }),
    );

    const sessionIndexes = await database.collection("sessions").indexes();
    expect(
      sessionIndexes.some((index) => index.key.sessionId === 1 && index.unique),
    ).toBe(true);
    expect(
      sessionIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
    const userIndexes = await database.collection("users").indexes();
    expect(
      userIndexes.some(
        (index) => index.key.invitationTokenHash === 1 && index.unique,
      ),
    ).toBe(true);
    const authEventIndexes = await database.collection("auth_events").indexes();
    expect(
      authEventIndexes.some(
        (index) => index.key.occurredAt === -1 && index.key.eventId === -1,
      ),
    ).toBe(true);
    await expect(
      database.collection("protocol_request_events").findOne({
        eventId: "legacy-protocol-event",
      }),
    ).resolves.toMatchObject({ category: "action" });
    const protocolAccessIndexes = await database
      .collection("protocol_request_events")
      .indexes();
    expect(
      protocolAccessIndexes.some(
        (index) =>
          index.key.requestId === 1 &&
          index.key.occurredAt === 1 &&
          index.key.eventId === 1 &&
          !index.unique,
      ),
    ).toBe(true);
    await expect(
      database
        .collection("refresh_token_consumptions")
        .countDocuments({ sessionId: "legacy-refresh-session" }),
    ).resolves.toBe(13);
    await expect(
      database.collection("sessions").findOne({
        sessionId: "legacy-refresh-session",
      }),
    ).resolves.not.toHaveProperty("consumedRefreshHashes");
    const consumptionIndexes = await database
      .collection("refresh_token_consumptions")
      .indexes();
    expect(
      consumptionIndexes.some(
        (index) =>
          index.key.sessionId === 1 &&
          index.key.tokenHash === 1 &&
          index.unique,
      ),
    ).toBe(true);
    const pageIndexes = await database.collection("pages").indexes();
    expect(
      pageIndexes.some((index) => index.key["data.slug"] === 1 && index.unique),
    ).toBe(true);
    expect(pageIndexes.some((index) => index.key.slug === 1)).toBe(false);
    const blackoutIndexes = await database.collection("blackouts").indexes();
    expect(
      blackoutIndexes.some(
        (index) =>
          index.key["data.startsAt"] === 1 && index.key["data.endsAt"] === 1,
      ),
    ).toBe(true);
    const counterpartyIndexes = await database
      .collection("counterparties")
      .indexes();
    expect(
      counterpartyIndexes.some(
        (index) =>
          index.key["data.organisationCanonical"] === 1 &&
          index.key["data.country"] === 1 &&
          index.unique,
      ),
    ).toBe(true);
    const deskConfigurationIndexes = await database
      .collection("desk_configurations")
      .indexes();
    expect(
      deskConfigurationIndexes.some(
        (index) => index.key["data.singletonKey"] === 1 && index.unique,
      ),
    ).toBe(true);
    const scholarIndexes = await database.collection("scholars").indexes();
    expect(
      scholarIndexes.some(
        (index) =>
          index.key["data.consentStatus"] === 1 &&
          index.key["data.cohortYear"] === -1,
      ),
    ).toBe(true);
    const emailTemplateIndexes = await database
      .collection("email_templates")
      .indexes();
    expect(
      emailTemplateIndexes.some(
        (index) => index.key["data.key"] === 1 && index.unique,
      ),
    ).toBe(true);
    const atlasIndexes = await database.collection("atlas_nodes").indexes();
    expect(
      atlasIndexes.some(
        (index) => index.key["data.slug"] === 1 && index.unique,
      ),
    ).toBe(true);
    expect(atlasIndexes.some((index) => index.key.slug === 1)).toBe(false);
    const sourceIndexes = await database.collection("sources").indexes();
    expect(
      sourceIndexes.some(
        (index) => index.key["data.ref"] === 1 && index.unique,
      ),
    ).toBe(true);
    expect(sourceIndexes.some((index) => index.key.ref === 1)).toBe(false);
    expect(
      consumptionIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
    const mediaIndexes = await database.collection("media_assets").indexes();
    expect(
      mediaIndexes.some(
        (index) =>
          index.key.publicId === 1 &&
          index.key.resourceType === 1 &&
          index.unique,
      ),
    ).toBe(true);
    expect(
      mediaIndexes.some((index) => index.name === "media_retention_scan"),
    ).toBe(true);
    expect(
      mediaIndexes.some(
        (index) =>
          index.key.status === 1 &&
          index.key.createdAt === -1 &&
          index.key.assetId === -1,
      ),
    ).toBe(true);
    expect(
      authEventIndexes.some(
        (index) => index.key.eventHash === 1 && index.unique,
      ),
    ).toBe(true);
    const editorialAuditIndexes = await database
      .collection("editorial_audit")
      .indexes();
    expect(
      editorialAuditIndexes.some(
        (index) =>
          index.key.documentType === 1 &&
          index.key.documentId === 1 &&
          index.key.sequence === 1 &&
          index.unique,
      ),
    ).toBe(true);
    const editorialHeadIndexes = await database
      .collection("editorial_audit_heads")
      .indexes();
    expect(
      editorialHeadIndexes.some(
        (index) =>
          index.key.documentType === 1 &&
          index.key.documentId === 1 &&
          index.unique,
      ),
    ).toBe(true);
    await expect(
      new CmsRepository(mongoose.connection).verifyAuditIntegrity(
        "page",
        "legacy-page",
      ),
    ).resolves.toEqual({
      status: "valid",
      checkedEvents: 2,
      headSequence: 2,
    });
    const publicationIndexes = await database
      .collection("publications")
      .indexes();
    expect(
      publicationIndexes.some(
        (index) =>
          index.key.documentType === 1 &&
          index.key.locale === 1 &&
          index.key.publishedAt === -1 &&
          index.key.documentId === 1,
      ),
    ).toBe(true);
    const rateLimitIndexes = await database.collection("rate_limits").indexes();
    expect(
      rateLimitIndexes.some(
        (index) =>
          index.key.key === 1 && index.key.windowStart === 1 && index.unique,
      ),
    ).toBe(true);
    const pressKitIndexes = await database
      .collection("press_kit_requests")
      .indexes();
    expect(
      pressKitIndexes.some(
        (index) => index.key.requestId === 1 && index.unique,
      ),
    ).toBe(true);
    expect(
      pressKitIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
    const mediaEnquiryIndexes = await database
      .collection("media_enquiries")
      .indexes();
    expect(
      mediaEnquiryIndexes.some(
        (index) => index.key.reference === 1 && index.unique,
      ),
    ).toBe(true);
    expect(
      mediaEnquiryIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
    const contactEnquiryIndexes = await database
      .collection("contact_enquiries")
      .indexes();
    expect(
      contactEnquiryIndexes.some(
        (index) => index.key.reference === 1 && index.unique,
      ),
    ).toBe(true);
    expect(
      contactEnquiryIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
    const dossierIndexes = await database
      .collection("living_dossier_requests")
      .indexes();
    expect(
      dossierIndexes.some((index) => index.key.requestId === 1 && index.unique),
    ).toBe(true);
    expect(
      dossierIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
    const protocolRequestIndexes = await database
      .collection("protocol_requests")
      .indexes();
    expect(
      protocolRequestIndexes.some(
        (index) => index.key.reference === 1 && index.unique,
      ),
    ).toBe(true);
    expect(
      protocolRequestIndexes.some(
        (index) => index.name === "protocol_retention_scan",
      ),
    ).toBe(true);
    const protocolEventIndexes = await database
      .collection("protocol_request_events")
      .indexes();
    expect(
      protocolEventIndexes.some(
        (index) =>
          index.key.requestId === 1 &&
          index.key.occurredAt === 1 &&
          index.key.eventId === 1 &&
          !index.unique,
      ),
    ).toBe(true);
    const protocolSlaIndexes = await database
      .collection("protocol_sla_escalations")
      .indexes();
    expect(
      protocolSlaIndexes.some(
        (index) => index.key.deduplicationKey === 1 && index.unique,
      ),
    ).toBe(true);
    expect(
      rateLimitIndexes.some(
        (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
  });

  it("quarantines, deletes and retries expired governed media without crossing holds or publications", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    await runMigrations(database, migrations);
    const collection = database.collection("media_assets");
    const fixtureIds = [
      "retention-delete",
      "retention-fail",
      "retention-published",
      "retention-held",
      "retention-future",
    ];
    const base = {
      resourceType: "image",
      retentionPolicy: "expires",
      legalHold: false,
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      secureUrl: "https://res.cloudinary.com/demo/image/upload/test.jpg",
    };
    await collection.insertMany([
      {
        ...base,
        assetId: "retention-delete",
        publicId: "amanor/archive/retention-delete",
        retainUntil: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        ...base,
        assetId: "retention-fail",
        publicId: "amanor/archive/retention-fail",
        retainUntil: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        ...base,
        assetId: "retention-published",
        publicId: "amanor/archive/retention-published",
        retainUntil: new Date("2026-08-03T00:00:00.000Z"),
      },
      {
        ...base,
        assetId: "retention-held",
        publicId: "amanor/archive/retention-held",
        legalHold: true,
        retainUntil: new Date("2026-08-04T00:00:00.000Z"),
      },
      {
        ...base,
        assetId: "retention-future",
        publicId: "amanor/archive/retention-future",
        retainUntil: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]);
    await database.collection("publications").insertOne({
      documentType: "page",
      documentId: "retention-media-page",
      locale: "en-GB",
      version: 1,
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await database.collection("content_versions").insertOne({
      documentType: "page",
      documentId: "retention-media-page",
      version: 1,
      payload: { heroAssetId: "retention-published" },
    });
    const destroy = vi.fn((publicId: string) => {
      if (publicId.endsWith("retention-fail"))
        return Promise.reject(new Error("synthetic provider outage"));
      return Promise.resolve();
    });

    const result = await new MediaRetentionService(
      new MediaRepository(mongoose.connection),
      { destroy } as never,
    ).run(new Date("2026-08-10T12:00:00.000Z"));

    expect(result).toEqual({ deleted: 1, failed: 1, referenced: 1 });
    await expect(
      collection.findOne({ assetId: "retention-delete" }),
    ).resolves.toMatchObject({
      status: "deleted",
      deletedAt: expect.any(Date),
    });
    await expect(
      collection.findOne({ assetId: "retention-delete" }),
    ).resolves.not.toHaveProperty("secureUrl");
    await expect(
      collection.findOne({ assetId: "retention-fail" }),
    ).resolves.toMatchObject({
      status: "quarantined",
      retention: {
        attempts: 1,
        failedAt: expect.any(Date),
        retryAt: new Date("2026-08-10T13:00:00.000Z"),
        lastError: "synthetic provider outage",
      },
    });
    await expect(
      collection.findOne({ assetId: "retention-fail" }),
    ).resolves.not.toHaveProperty("retention.lockToken");
    await expect(
      collection.findOne({ assetId: "retention-published" }),
    ).resolves.toMatchObject({
      status: "active",
      retention: {
        blockedByPublicationAt: expect.any(Date),
        retryAt: new Date("2026-08-11T12:00:00.000Z"),
      },
    });
    expect(destroy.mock.calls.map(([publicId]) => publicId)).toEqual([
      "amanor/archive/retention-delete",
      "amanor/archive/retention-fail",
    ]);
    await expect(
      collection.findOne({ assetId: "retention-held" }),
    ).resolves.toMatchObject({ status: "active" });
    await expect(
      collection.findOne({ assetId: "retention-future" }),
    ).resolves.toMatchObject({ status: "active" });

    await collection.deleteMany({ assetId: { $in: fixtureIds } });
    await database
      .collection("publications")
      .deleteOne({ documentId: "retention-media-page" });
    await database
      .collection("content_versions")
      .deleteOne({ documentId: "retention-media-page" });
  });

  it("allows exactly one cross-instance revalidation claim", async () => {
    const repository = new RevalidationClaimRepository(mongoose.connection);
    const key = `publish:page:home:${randomUUID()}`;
    const results = await Promise.all([
      repository.claim(key),
      repository.claim(key),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const stored = await mongoose.connection.db
      ?.collection("revalidation_claims")
      .findOne({ idempotencyKey: key });
    expect(stored).toEqual(
      expect.objectContaining({
        idempotencyKey: key,
        claimedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    );
  });

  it("atomically persists a Protocol Desk request and its initial immutable event", async () => {
    const repository = new ProtocolDeskRepository(mongoose.connection);
    const request = await repository.create(
      {
        locale: "en-GB",
        capacity: "personal",
        organisation: {
          name: "African Finance Forum",
          type: "multilateral",
          country: "GH",
          website: "https://forum.example",
        },
        requester: {
          name: "Ama Mensah",
          role: "Director",
          email: "ama@example.org",
        },
        engagement: {
          type: "keynote",
          eventName: "Finance Forum",
          startsAt: new Date("2026-12-01T09:00:00Z"),
          city: "Accra",
          country: "GH",
          format: "in_person",
          language: "english",
          audienceSize: 200,
          audienceDescription: "Senior public and private finance leaders",
        },
        ask: {
          proposedTheme: "Financing transformation",
          objective: "Understand practical routes from ambition to investment.",
          recording: false,
        },
        logistics: {
          travel: "host_covered",
          honorarium: "discuss",
          invitationLetter: true,
          visaLetter: false,
          governmentProtocol: false,
          otherPrincipals: false,
          contactName: "Kojo Annan",
          contactPhone: "+233200000000",
        },
        consent: {
          dataProcessing: true,
          authorityToInvite: true,
          version: "2026-08",
        },
      },
      new Date("2026-08-10T00:00:00Z"),
      {
        screenedAt: new Date("2026-08-10T00:00:05Z"),
        organisationDomainVerified: false,
        approvedThemeTerms: ["financing transformation"],
        counterpartyMatches: ["Governed financing partner"],
      },
    );
    expect(request.reference).toBe("PD-2026-0001");
    expect(request.capacityAssessment).toMatchObject({
      classification: "personal",
      basis: "explicit",
      version: "capacity-v1-conservative",
    });
    expect(request).toMatchObject({
      state: "screened",
      triageScore: expect.any(Number),
      triageAssessment: { version: "triage-v1-advisory" },
      flags: expect.arrayContaining([
        expect.objectContaining({ type: "conflict", severity: "blocking" }),
        expect.objectContaining({ type: "unverified" }),
      ]),
    });
    const blackoutPayload = {
      startsAt: new Date("2026-12-01T08:00:00Z"),
      endsAt: new Date("2026-12-01T10:00:00Z"),
      reason: "travel",
      visibility: "unavailable",
      notes: "Private itinerary",
    } as const;
    await mongoose.connection.db?.collection("content_versions").insertOne({
      documentType: "blackout",
      documentId: "principal-travel",
      version: 1,
      state: "published",
      authorId: "principal-1",
      payload: blackoutPayload,
    });
    const blackoutPublication = {
      documentType: "blackout",
      documentId: "principal-travel",
      locale: "en-GB",
      version: 1,
      publishedAt: new Date("2026-08-10T00:00:00Z"),
    } as const;
    await mongoose.connection.db
      ?.collection("publications")
      .insertOne(blackoutPublication);
    if (mongoose.connection.db)
      await materializeStructuredPublication(
        mongoose.connection.db,
        blackoutPublication,
        blackoutPayload,
      );
    await expect(
      new AvailabilityService(mongoose.connection).check(
        {
          startsAt: request.engagement.startsAt,
          endsAt: new Date("2026-12-01T11:00:00Z"),
          excludeRequestId: request.requestId,
        },
        ["desk_officer"],
        new Date("2026-08-10T00:00:01Z"),
      ),
    ).resolves.toMatchObject({
      available: false,
      conflicts: [
        expect.objectContaining({
          type: "blackout",
          reference: "principal-travel",
        }),
      ],
    });
    await expect(repository.events(request.requestId)).resolves.toEqual([
      expect.objectContaining({
        requestId: request.requestId,
        fromState: null,
        toState: "received",
        actorRole: "system",
      }),
      expect.objectContaining({
        fromState: "received",
        toState: "screened",
        actorRole: "system",
      }),
    ]);
    await expect(
      repository.listQueue({
        limit: 10,
        state: "screened",
        flag: "unverified",
        q: "Finance Forum",
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          requestId: request.requestId,
          reference: "PD-2026-0001",
          state: "screened",
          triageScore: expect.any(Number),
          flags: expect.arrayContaining([
            expect.objectContaining({ type: "unverified" }),
          ]),
        }),
      ],
    });
    await expect(repository.events(request.requestId)).resolves.toEqual([
      expect.objectContaining({ fromState: null, toState: "received" }),
      expect.objectContaining({
        fromState: "received",
        toState: "screened",
        actorRole: "system",
      }),
    ]);
    await expect(
      repository.addNote(
        request.requestId,
        "Verified host contact.",
        { id: "desk-1", roles: ["desk_officer"] },
        new Date("2026-08-10T00:00:05.500Z"),
      ),
    ).resolves.toMatchObject({
      requestId: request.requestId,
      authorRole: "desk_officer",
    });
    expect(
      await mongoose.connection.db
        ?.collection("protocol_requests")
        .countDocuments({ requestId: request.requestId }),
    ).toBe(1);
    expect(
      await mongoose.connection.db
        ?.collection("protocol_request_events")
        .countDocuments({ requestId: request.requestId }),
    ).toBe(3);
    expect(
      await mongoose.connection.db
        ?.collection("protocol_request_notes")
        .countDocuments({ requestId: request.requestId }),
    ).toBe(1);
    await expect(
      mongoose.connection.db
        ?.collection("correspondence")
        .find({ requestId: request.requestId })
        .sort({ availableAt: 1 })
        .toArray(),
    ).resolves.toEqual([
      expect.objectContaining({
        template: "acknowledgement",
        locale: "en-GB",
        status: "pending",
      }),
      expect.objectContaining({
        template: "status-update",
        availableAt: new Date("2026-08-12T00:00:00.000Z"),
      }),
    ]);
    const operations = new ProtocolDeskOperationsService(mongoose.connection);
    await mongoose.connection.db
      ?.collection("correspondence")
      .updateOne(
        { requestId: request.requestId, template: "status-update" },
        { $set: { availableAt: new Date("2026-08-09T23:59:00.000Z") } },
      );
    await operations.refresh(new Date("2026-08-10T00:00:06.000Z"));
    await expect(
      operations.snapshot(
        ["desk_officer"],
        new Date("2026-08-10T00:00:06.000Z"),
      ),
    ).resolves.toMatchObject({
      overdueInitialResponses: 1,
      openEscalations: [
        expect.objectContaining({
          type: "initial_response_overdue",
          reference: "PD-2026-0001",
        }),
      ],
    });
    await repository.assign(
      request.requestId,
      "desk-2",
      { id: "principal-1", roles: ["principal"] },
      new Date("2026-08-10T00:00:06Z"),
    );
    await expect(repository.detail(request.requestId)).resolves.toMatchObject({
      request: {
        assignedTo: "desk-2",
        assignedBy: "principal-1",
        triageDimensions: expect.any(Array),
      },
      notes: [expect.objectContaining({ body: "Verified host contact." })],
      correspondence: [
        expect.objectContaining({ template: "acknowledgement" }),
        expect.objectContaining({ template: "status-update" }),
      ],
      events: [
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ reason: "Assigned to desk-2" }),
      ],
    });
    const unverifiedFlag = request.flags.find(
      (flag) => flag.type === "unverified",
    );
    if (!unverifiedFlag) throw new Error("Expected unverified flag");
    await repository.clearFlag(
      request.requestId,
      unverifiedFlag.flagId,
      "Organisation confirmed by telephone",
      { id: "desk-2", roles: ["desk_officer"] },
      new Date("2026-08-10T00:00:07Z"),
    );
    await expect(repository.detail(request.requestId)).resolves.toMatchObject({
      request: {
        flags: expect.arrayContaining([
          expect.objectContaining({
            flagId: unverifiedFlag.flagId,
            clearedBy: "desk-2",
            clearanceReason: "Organisation confirmed by telephone",
          }),
        ]),
      },
      events: expect.arrayContaining([
        expect.objectContaining({
          reason: expect.stringContaining("Cleared unverified flag"),
        }),
      ]),
    });
    const conflictFlag = request.flags.find((flag) => flag.type === "conflict");
    if (!conflictFlag) throw new Error("Expected conflict flag");
    await repository.clearFlag(
      request.requestId,
      conflictFlag.flagId,
      "Principal reviewed the governed counterparty relationship",
      { id: "principal-1", roles: ["principal"] },
      new Date("2026-08-10T00:00:07.500Z"),
    );
    const deskActor = { id: "desk-2", roles: ["desk_officer"] as const };
    const principalActor = {
      id: "principal-1",
      roles: ["principal"] as const,
    };
    await repository.transition(
      request.requestId,
      "awaiting_decision",
      deskActor,
      "Desk review complete",
      undefined,
      new Date("2026-08-10T00:00:08Z"),
    );
    await expect(
      repository.transition(
        request.requestId,
        "accepted",
        principalActor,
        "Approved",
        undefined,
        new Date("2026-08-10T00:00:09Z"),
      ),
    ).rejects.toThrow("Protocol Note configuration is required");
    await repository.configureProtocolNote(
      request.requestId,
      {
        speakerContactName: "Amanor Protocol Desk",
        speakerContactEmail: "protocol@example.test",
        technicalRequirements: [],
        logistics: [],
        accessibilityRequirements: [],
        lecternRequired: false,
      },
      deskActor,
      new Date("2026-08-10T00:00:10Z"),
    );
    await expect(repository.detail(request.requestId)).resolves.toMatchObject({
      request: {
        protocolNoteConfiguration: {
          speakerContactEmail: "protocol@example.test",
          configuredBy: "desk-2",
        },
      },
      events: expect.arrayContaining([
        expect.objectContaining({
          reason: "Protocol Note configuration updated",
        }),
      ]),
    });
    const delivery = await mongoose.connection.db
      ?.collection("protocol_principal_decision_deliveries")
      .findOne({ requestId: request.requestId });
    expect(delivery).toMatchObject({
      status: "pending",
      attempts: 0,
      availableAt: new Date("2026-08-10T00:00:10Z"),
    });
    if (!delivery)
      throw new Error("Principal decision delivery was not queued");
    const decisionKey = Buffer.alloc(32, 5).toString("base64");
    await mongoose.connection.db?.collection("users").insertOne({
      userId: "principal-delivery-user",
      emailCanonical: "principal@example.test",
      passwordHash: "not-used",
      roles: ["principal"],
      roleVersion: 1,
      invitationAcceptedAt: new Date("2026-08-01T00:00:00Z"),
    });
    const provider = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "resend-decision-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", provider);
    const deliveryConfig = {
      RESEND_API_KEY: "resend-test-key",
      EMAIL_FROM: "Project AMANOR <desk@example.test>",
      PROTOCOL_DECISION_DERIVATION_KEY: decisionKey,
      PUBLIC_WEB_ORIGIN: "https://amanor.example",
    } as const;
    const note = {
      generateStored: vi.fn().mockResolvedValue({
        body: Buffer.from("stable-protocol-note"),
        filename: "protocol-note-pd-2026-0001-en-GB.pdf",
      }),
    };
    const worker = new PrincipalDecisionDeliveryWorker(
      mongoose.connection,
      {
        get: (key: keyof typeof deliveryConfig) => deliveryConfig[key],
        getOrThrow: (key: keyof typeof deliveryConfig) => deliveryConfig[key],
      } as ConfigService,
      repository,
      note as never,
    );
    try {
      await worker.drain();
      await expect(
        mongoose.connection.db
          ?.collection("protocol_principal_decision_deliveries")
          .findOne({ deliveryId: delivery.deliveryId }),
      ).resolves.toMatchObject({
        status: "failed",
        attempts: 1,
        lastError: "Resend returned HTTP 503",
      });
      expect(provider).toHaveBeenCalledTimes(1);
      await expect(repository.detail(request.requestId)).resolves.toMatchObject(
        {
          principalDecisionDelivery: [
            {
              deliveryId: delivery.deliveryId,
              status: "failed",
              attempts: 1,
            },
          ],
        },
      );
      const failedDetail = await repository.detail(request.requestId);
      expect(JSON.stringify(failedDetail)).not.toContain(
        "Resend returned HTTP 503",
      );
      expect(JSON.stringify(failedDetail)).not.toContain("resend-decision-1");
      const auditEvents = mongoose.connection.db?.collection(
        "protocol_request_events",
      );
      if (!auditEvents)
        throw new Error("Audit event collection is unavailable");
      const rollbackIndex = "test_principal_delivery_retry_audit_failure";
      const rollbackEventId = "test-principal-delivery-retry-audit-conflict";
      await auditEvents.createIndex(
        { requestId: 1, reason: 1 },
        {
          name: rollbackIndex,
          unique: true,
          partialFilterExpression: {
            reason: "Principal decision delivery retry requested",
          },
        },
      );
      await auditEvents.insertOne({
        eventId: rollbackEventId,
        requestId: request.requestId,
        category: "action",
        fromState: "awaiting_decision",
        toState: "awaiting_decision",
        actorId: "rollback-fixture",
        actorRole: "desk_officer",
        reason: "Principal decision delivery retry requested",
        occurredAt: new Date("2026-08-10T00:00:09Z"),
      });
      try {
        await expect(
          repository.retryPrincipalDecisionDelivery(
            request.requestId,
            delivery.deliveryId,
            deskActor,
            new Date("2026-08-10T00:00:09.500Z"),
          ),
        ).rejects.toMatchObject({ code: 11_000 });
        await expect(
          mongoose.connection.db
            ?.collection("protocol_principal_decision_deliveries")
            .findOne({ deliveryId: delivery.deliveryId }),
        ).resolves.toMatchObject({
          status: "failed",
          attempts: 1,
          lastError: "Resend returned HTTP 503",
        });
        expect(
          await auditEvents.countDocuments({
            requestId: request.requestId,
            reason: "Principal decision delivery retry requested",
          }),
        ).toBe(1);
      } finally {
        await auditEvents.deleteOne({ eventId: rollbackEventId });
        await auditEvents.dropIndex(rollbackIndex);
      }
      await expect(
        repository.retryPrincipalDecisionDelivery(
          "99999999-9999-4999-8999-999999999999",
          delivery.deliveryId,
          deskActor,
        ),
      ).rejects.toThrow("Failed Principal decision delivery was not found");
      await repository.retryPrincipalDecisionDelivery(
        request.requestId,
        delivery.deliveryId,
        deskActor,
        new Date("2026-08-10T00:00:10Z"),
      );
      await expect(
        mongoose.connection.db
          ?.collection("protocol_principal_decision_deliveries")
          .findOne({ deliveryId: delivery.deliveryId }),
      ).resolves.toMatchObject({
        status: "pending",
        attempts: 0,
        availableAt: new Date("2026-08-10T00:00:10Z"),
      });
      await expect(
        mongoose.connection.db?.collection("protocol_request_events").findOne({
          requestId: request.requestId,
          reason: "Principal decision delivery retry requested",
        }),
      ).resolves.toMatchObject({
        category: "action",
        actorId: deskActor.id,
        actorRole: "desk_officer",
        fromState: "awaiting_decision",
        toState: "awaiting_decision",
        occurredAt: new Date("2026-08-10T00:00:10Z"),
      });
      await worker.drain();
    } finally {
      vi.unstubAllGlobals();
      await mongoose.connection.db
        ?.collection("users")
        .deleteOne({ userId: "principal-delivery-user" });
    }
    expect(provider).toHaveBeenCalledTimes(2);
    const firstDelivery = provider.mock.calls[0]?.[1] as
      RequestInit | undefined;
    const secondDelivery = provider.mock.calls[1]?.[1] as
      RequestInit | undefined;
    expect(firstDelivery?.body).toBe(secondDelivery?.body);
    if (typeof secondDelivery?.body !== "string")
      throw new Error("Principal decision provider body was not serialized");
    const deliveredPayload = JSON.parse(secondDelivery.body) as Record<
      string,
      unknown
    >;
    expect(deliveredPayload).toMatchObject({
      to: ["principal@example.test"],
      subject: "Decision required · PD-2026-0001",
      attachments: [{ filename: "protocol-note-pd-2026-0001-en-GB.pdf" }],
    });
    expect(String(deliveredPayload.text)).toContain(
      "/protocol-decision#token=",
    );
    await expect(
      mongoose.connection.db
        ?.collection("protocol_principal_decision_deliveries")
        .findOne({ deliveryId: delivery.deliveryId }),
    ).resolves.toMatchObject({
      status: "delivered",
      attempts: 1,
      providerMessageId: "resend-decision-1",
    });
    await expect(
      repository.retryPrincipalDecisionDelivery(
        request.requestId,
        delivery.deliveryId,
        deskActor,
      ),
    ).rejects.toThrow("Failed Principal decision delivery was not found");
    expect(
      await mongoose.connection.db
        ?.collection("protocol_request_events")
        .countDocuments({
          requestId: request.requestId,
          reason: "Principal decision delivery retry requested",
        }),
    ).toBe(1);
    const deliveredCapabilities =
      await repository.capabilitiesForPrincipalDelivery(
        request.requestId,
        delivery.deliveryId,
        "principal-1",
        decisionKey,
      );
    expect(Object.keys(deliveredCapabilities).sort()).toEqual([
      "accept",
      "decline",
      "hold",
      "request_information",
    ]);
    await expect(
      repository.capabilitiesForPrincipalDelivery(
        request.requestId,
        delivery.deliveryId,
        "principal-1",
        decisionKey,
      ),
    ).resolves.toEqual(deliveredCapabilities);
    const storedDeliveryCapabilities = await mongoose.connection.db
      ?.collection("protocol_decision_capabilities")
      .find({ deliveryId: delivery.deliveryId })
      .toArray();
    expect(storedDeliveryCapabilities).toHaveLength(4);
    for (const token of Object.values(deliveredCapabilities))
      expect(JSON.stringify(storedDeliveryCapabilities)).not.toContain(token);
    await expect(
      repository.issuePrincipalDecisionCapability(
        request.requestId,
        "accept",
        deskActor,
        new Date("2026-08-10T00:00:10.500Z"),
      ),
    ).rejects.toThrow("Only the Principal");
    const decision = await repository.issuePrincipalDecisionCapability(
      request.requestId,
      "accept",
      principalActor,
      new Date("2026-08-10T00:00:10.500Z"),
    );
    const storedCapability = await mongoose.connection.db
      ?.collection("protocol_decision_capabilities")
      .findOne({
        requestId: request.requestId,
        action: "accept",
        status: "active",
      });
    expect(storedCapability).toMatchObject({
      action: "accept",
      status: "active",
      expiresAt: new Date("2026-08-12T00:00:10.500Z"),
    });
    expect(JSON.stringify(storedCapability)).not.toContain(decision.token);
    const holdDecision = await repository.issuePrincipalDecisionCapability(
      request.requestId,
      "hold",
      principalActor,
      new Date("2026-08-10T00:00:10.750Z"),
    );
    expect(
      await mongoose.connection.db
        ?.collection("protocol_decision_capabilities")
        .countDocuments({ requestId: request.requestId, status: "active" }),
    ).toBe(4);
    await expect(
      repository.consumePrincipalDecisionCapability(
        decision.token,
        "accept",
        "Approved in personal capacity",
        undefined,
        new Date("2026-08-10T00:00:11Z"),
      ),
    ).resolves.toEqual({ reference: request.reference, state: "accepted" });
    await expect(
      repository.consumePrincipalDecisionCapability(
        holdDecision.token,
        "hold",
        "Sibling replay",
        undefined,
        new Date("2026-08-10T00:00:11.500Z"),
      ),
    ).rejects.toThrow("invalid, expired, or already used");
    await expect(
      repository.consumePrincipalDecisionCapability(
        decision.token,
        "accept",
        "Replay",
        undefined,
        new Date("2026-08-10T00:00:12Z"),
      ),
    ).rejects.toThrow("invalid, expired, or already used");
    await expect(repository.detail(request.requestId)).resolves.toMatchObject({
      request: { state: "accepted" },
      correspondence: expect.arrayContaining([
        expect.objectContaining({ template: "acceptance", status: "pending" }),
      ]),
    });
    const correspondenceJob = await mongoose.connection.db
      ?.collection("correspondence")
      .findOneAndUpdate(
        {
          requestId: request.requestId,
          template: "acceptance",
          status: "pending",
        },
        {
          $set: {
            status: "failed",
            attempts: 2,
            lastError: "Correspondence provider returned HTTP 503",
          },
        },
        { returnDocument: "after" },
      );
    if (!correspondenceJob)
      throw new Error("Acceptance correspondence was not persisted");
    const assertRecoveryAuditRollback = async (fixture: {
      readonly reason: string;
      readonly eventId: string;
      readonly indexName: string;
      readonly occurredAt: Date;
      readonly attempt: () => Promise<void>;
      readonly assertJobUnchanged: () => Promise<void>;
    }): Promise<void> => {
      const auditEvents = mongoose.connection.db?.collection(
        "protocol_request_events",
      );
      if (!auditEvents)
        throw new Error("Audit event collection is unavailable");
      await auditEvents.createIndex(
        { requestId: 1, reason: 1 },
        {
          name: fixture.indexName,
          unique: true,
          partialFilterExpression: { reason: fixture.reason },
        },
      );
      await auditEvents.insertOne({
        eventId: fixture.eventId,
        requestId: request.requestId,
        category: "action",
        fromState: "accepted",
        toState: "accepted",
        actorId: "rollback-fixture",
        actorRole: "desk_officer",
        reason: fixture.reason,
        occurredAt: fixture.occurredAt,
      });
      try {
        await expect(fixture.attempt()).rejects.toMatchObject({ code: 11_000 });
        await fixture.assertJobUnchanged();
        expect(
          await auditEvents.countDocuments({
            requestId: request.requestId,
            reason: fixture.reason,
          }),
        ).toBe(1);
      } finally {
        await auditEvents.deleteOne({ eventId: fixture.eventId });
        await auditEvents.dropIndex(fixture.indexName);
      }
    };
    await assertRecoveryAuditRollback({
      reason: "Correspondence retry requested",
      eventId: "test-correspondence-retry-audit-conflict",
      indexName: "test_correspondence_retry_audit_failure",
      occurredAt: new Date("2026-08-10T00:00:11.100Z"),
      attempt: () =>
        repository.retryCorrespondence(
          request.requestId,
          correspondenceJob.correspondenceId,
          deskActor,
          new Date("2026-08-10T00:00:11.125Z"),
        ),
      assertJobUnchanged: async () => {
        await expect(
          mongoose.connection.db
            ?.collection("correspondence")
            .findOne({ correspondenceId: correspondenceJob.correspondenceId }),
        ).resolves.toMatchObject({
          status: "failed",
          attempts: 2,
          lastError: "Correspondence provider returned HTTP 503",
        });
      },
    });
    await repository.retryCorrespondence(
      request.requestId,
      correspondenceJob.correspondenceId,
      deskActor,
      new Date("2026-08-10T00:00:11.250Z"),
    );
    await expect(
      mongoose.connection.db
        ?.collection("correspondence")
        .findOne({ correspondenceId: correspondenceJob.correspondenceId }),
    ).resolves.toMatchObject({
      status: "pending",
      attempts: 0,
      availableAt: new Date("2026-08-10T00:00:11.250Z"),
    });
    await expect(
      mongoose.connection.db?.collection("protocol_request_events").findOne({
        requestId: request.requestId,
        reason: "Correspondence retry requested",
      }),
    ).resolves.toMatchObject({
      category: "action",
      actorId: deskActor.id,
      actorRole: "desk_officer",
      fromState: "accepted",
      toState: "accepted",
      occurredAt: new Date("2026-08-10T00:00:11.250Z"),
    });
    await expect(
      mongoose.connection.db
        ?.collection("calendar_sync_jobs")
        .findOne({ requestId: request.requestId }),
    ).resolves.toMatchObject({
      operation: "upsert",
      status: "pending",
      attempts: 0,
      availableAt: new Date("2026-08-10T00:00:11Z"),
    });
    const calendarJob = await mongoose.connection.db
      ?.collection("calendar_sync_jobs")
      .findOneAndUpdate(
        { requestId: request.requestId },
        {
          $set: {
            status: "failed",
            attempts: 2,
            lastError: "Calendar adapter returned HTTP 503",
          },
        },
        { returnDocument: "after" },
      );
    if (!calendarJob) throw new Error("Calendar job was not persisted");
    await expect(repository.detail(request.requestId)).resolves.toMatchObject({
      calendarSync: [
        {
          syncId: calendarJob.syncId,
          status: "failed",
          attempts: 2,
          lastError: "Calendar adapter returned HTTP 503",
        },
      ],
    });
    await assertRecoveryAuditRollback({
      reason: "Calendar synchronization retry requested",
      eventId: "test-calendar-retry-audit-conflict",
      indexName: "test_calendar_retry_audit_failure",
      occurredAt: new Date("2026-08-10T00:00:11.350Z"),
      attempt: () =>
        repository.retryCalendarSync(
          request.requestId,
          calendarJob.syncId,
          deskActor,
          new Date("2026-08-10T00:00:11.375Z"),
        ),
      assertJobUnchanged: async () => {
        await expect(
          mongoose.connection.db
            ?.collection("calendar_sync_jobs")
            .findOne({ syncId: calendarJob.syncId }),
        ).resolves.toMatchObject({
          status: "failed",
          attempts: 2,
          lastError: "Calendar adapter returned HTTP 503",
        });
      },
    });
    await repository.retryCalendarSync(
      request.requestId,
      calendarJob.syncId,
      deskActor,
      new Date("2026-08-10T00:00:11.500Z"),
    );
    await expect(
      mongoose.connection.db
        ?.collection("calendar_sync_jobs")
        .findOne({ syncId: calendarJob.syncId }),
    ).resolves.toMatchObject({
      status: "pending",
      attempts: 0,
      availableAt: new Date("2026-08-10T00:00:11.500Z"),
    });
    await expect(
      mongoose.connection.db?.collection("protocol_request_events").findOne({
        requestId: request.requestId,
        reason: "Calendar synchronization retry requested",
      }),
    ).resolves.toMatchObject({
      category: "action",
      actorId: deskActor.id,
      actorRole: "desk_officer",
      fromState: "accepted",
      toState: "accepted",
      occurredAt: new Date("2026-08-10T00:00:11.500Z"),
    });
    await operations.refresh(new Date("2026-08-10T00:00:12Z"));
    await expect(
      mongoose.connection.db
        ?.collection("protocol_sla_escalations")
        .findOne({ requestId: request.requestId }),
    ).resolves.toMatchObject({ status: "resolved" });
    const stored = await mongoose.connection.db
      ?.collection("protocol_requests")
      .findOne({ requestId: request.requestId });
    if (!stored) throw new Error("Screened request was not persisted");
    const {
      _id: ignoredId,
      triageScore: ignoredScore,
      triageAssessment: ignoredAssessment,
      ...unscored
    } = stored;
    void ignoredId;
    void ignoredScore;
    void ignoredAssessment;
    const unscoredIds = [randomUUID(), randomUUID()];
    await mongoose.connection.db?.collection("protocol_requests").insertMany(
      unscoredIds.map((requestId, index) => ({
        ...unscored,
        requestId,
        reference: `PD-2026-000${index + 2}`,
        state: "received",
        flags: [],
        createdAt: new Date(`2026-08-10T00:00:0${index + 6}Z`),
      })),
    );
    const firstPage = await repository.listQueue({ limit: 2 });
    const secondPage = await repository.listQueue({
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(firstPage.items.map((item) => item.requestId)).toEqual([
      request.requestId,
      unscoredIds[0],
    ]);
    expect(secondPage.items.map((item) => item.requestId)).toEqual([
      unscoredIds[1],
    ]);
    const viewedAt = new Date("2026-08-10T00:00:20Z");
    await repository.recordQueueAccess(firstPage.items, deskActor, viewedAt);
    await expect(
      repository.recordAccess(
        request.requestId,
        principalActor,
        "Request detail viewed",
        viewedAt,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.recordAccess(
        request.requestId,
        deskActor,
        "Request detail viewed",
        viewedAt,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.recordAccess(
        randomUUID(),
        deskActor,
        "Request detail viewed",
        viewedAt,
      ),
    ).resolves.toBe(false);
    const accessEvents = await mongoose.connection.db
      ?.collection("protocol_request_events")
      .find({ requestId: request.requestId, category: "access" })
      .sort({ actorId: 1 })
      .toArray();
    expect(accessEvents).toHaveLength(3);
    expect(accessEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "desk-2",
          actorRole: "desk_officer",
          reason: "Request surfaced in operator queue",
          occurredAt: viewedAt,
        }),
        expect.objectContaining({
          actorId: "desk-2",
          actorRole: "desk_officer",
          reason: "Request detail viewed",
          occurredAt: viewedAt,
        }),
        expect.objectContaining({
          actorId: "principal-1",
          actorRole: "principal",
          reason: "Request detail viewed",
          occurredAt: viewedAt,
        }),
      ]),
    );
  });

  it("delivers the immediate acknowledgement from the durable outbox with published content and an idempotency key", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const now = new Date("2026-08-10T00:00:00.000Z");
    const localized = (en: string, fr: string) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: { "en-GB": "current", "fr-FR": "current" },
      sourceUpdatedAt: now,
    });
    const identity = {
      singletonKey: "canonical",
      legalName: "Ishmael Nii Amanor Dodoo",
      honorific: "Dr",
      displayName: "Dr Ishmael Dodoo",
      shortName: "Ishmael Dodoo",
      familiarName: "Dr Ish",
      pronunciationGuide: localized("Ish-mael", "Ish-mael"),
      nationality: localized("Ghanaian", "Ghanéen"),
      languages: ["English", "French"],
      location: localized("Accra", "Accra"),
      titleHistory: [
        {
          title: localized("Public-service leader", "Responsable public"),
          longFormTitle: localized(
            "Public-service leader",
            "Responsable du service public",
          ),
          organisation: localized("Public office", "Institution publique"),
          from: new Date("2025-01-01T00:00:00.000Z"),
          to: null,
          sourceRef: "source-e2e",
        },
      ],
      bio40: localized("Short biography", "Biographie courte"),
      bio40SourceRefs: ["source-e2e"],
      bio120: localized("Medium biography", "Biographie moyenne"),
      bio120SourceRefs: ["source-e2e"],
      bio300: localized("Long biography", "Biographie longue"),
      bio300SourceRefs: ["source-e2e"],
      portraits: [],
    };
    const acknowledgement = {
      key: "acknowledgement",
      subject: localized(
        "Request {{reference}} received",
        "Demande {{reference}} reçue",
      ),
      bodyText: localized(
        "Hello {{requesterName}}. We will respond within {{responseWindow}}.",
        "Bonjour {{requesterName}}. Réponse sous {{responseWindow}}.",
      ),
      bodyHtml: localized(
        "<p>Hello {{requesterName}}.</p><p>We will respond within {{responseWindow}}.</p>",
        "<p>Bonjour {{requesterName}}.</p><p>Réponse sous {{responseWindow}}.</p>",
      ),
      allowedVariables: ["reference", "requesterName", "responseWindow"],
      transactional: true,
    };
    await database.collection("content_versions").insertMany([
      {
        documentType: "identity",
        documentId: "correspondence-canonical",
        version: 1,
        state: "published",
        authorId: "correspondence-reviewer",
        payload: identity,
        createdAt: now,
        updatedAt: now,
      },
      {
        documentType: "emailTemplate",
        documentId: "correspondence-acknowledgement",
        version: 1,
        state: "published",
        authorId: "correspondence-reviewer",
        payload: acknowledgement,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const correspondencePublications = [
      {
        documentType: "identity",
        documentId: "correspondence-canonical",
        locale: "en-GB",
        version: 1,
        publishedAt: now,
        publishedBy: "correspondence-reviewer",
      },
      {
        documentType: "emailTemplate",
        documentId: "correspondence-acknowledgement",
        locale: "en-GB",
        version: 1,
        publishedAt: now,
        publishedBy: "correspondence-reviewer",
      },
    ] as const;
    await database
      .collection("publications")
      .insertMany([...correspondencePublications]);
    await materializeStructuredPublication(
      database,
      correspondencePublications[0],
      identity,
    );
    await materializeStructuredPublication(
      database,
      correspondencePublications[1],
      acknowledgement,
    );
    const job = await database.collection("correspondence").findOne({
      template: "acknowledgement",
      status: "pending",
    });
    expect(job).toBeTruthy();
    await database
      .collection("correspondence")
      .updateMany(
        { correspondenceId: { $ne: job?.correspondenceId }, status: "pending" },
        { $set: { availableAt: new Date("2030-01-01T00:00:00.000Z") } },
      );
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "resend-acknowledgement-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", send);
    try {
      const worker = new CorrespondenceWorker(
        mongoose.connection,
        new ConfigService({
          RESEND_API_KEY: "resend-test-key",
          EMAIL_FROM: "Project AMANOR <desk@example.test>",
        }),
        { generateStored: vi.fn() } as never,
      );
      await worker.drain();
      await expect(
        database.collection("correspondence").findOne({
          correspondenceId: job?.correspondenceId,
        }),
      ).resolves.toMatchObject({
        status: "failed",
        attempts: 1,
        lastError: "Resend returned HTTP 503",
        availableAt: expect.any(Date),
      });
      await database
        .collection("correspondence")
        .updateOne(
          { correspondenceId: job?.correspondenceId },
          { $set: { availableAt: new Date("2026-08-10T00:00:00.000Z") } },
        );
      await worker.drain();
      expect(send).toHaveBeenCalledTimes(2);
      const [endpoint, request] = send.mock.calls[1] as [
        string,
        { headers: Record<string, string>; body: string },
      ];
      expect(endpoint).toBe("https://api.resend.com/emails");
      expect(
        (send.mock.calls[0]?.[1] as { headers: Record<string, string> })
          .headers["Idempotency-Key"],
      ).toBe(job?.correspondenceId);
      expect(request.headers["Idempotency-Key"]).toBe(job?.correspondenceId);
      expect(JSON.parse(request.body)).toMatchObject({
        from: "Project AMANOR <desk@example.test>",
        to: ["ama@example.org"],
        subject: "Request PD-2026-0001 received",
        text: expect.stringContaining("forty-eight hours"),
        html: expect.stringContaining("Ama Mensah"),
      });
      await expect(
        database.collection("correspondence").findOne({
          correspondenceId: job?.correspondenceId,
        }),
      ).resolves.toMatchObject({
        status: "delivered",
        attempts: 2,
        providerMessageId: "resend-acknowledgement-1",
        deliveredAt: expect.any(Date),
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("pseudonymises expired Protocol Desk data transactionally, respects holds and reconciles restores", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const now = new Date("2026-08-10T10:00:00.000Z");
    const expiredAt = new Date("2023-08-10T09:59:59.000Z");
    const currentAt = new Date("2023-08-10T10:00:01.000Z");
    const request = (requestId: string, createdAt: Date) => ({
      requestId,
      reference: `PD-2023-${requestId.slice(-4)}`,
      locale: "en-GB",
      capacity: "personal",
      capacityContext: "Personal invitation",
      capacityFunding: "Host funded",
      capacityAssessment: {
        classification: "personal",
        basis: "explicit",
        version: "capacity-v1-conservative",
      },
      organisation: {
        name: "Personal Data Organisation",
        type: "civil_society",
        country: "GH",
        website: "https://personal.example",
        convenors: "Named convenor",
      },
      requester: {
        name: "Personal Name",
        role: "Personal Role",
        email: `${requestId}@example.test`,
        phone: "+233200000000",
      },
      engagement: {
        type: "keynote",
        eventName: "Personal Event",
        startsAt: new Date("2023-09-01T09:00:00.000Z"),
        city: "Accra",
        country: "GH",
        venue: "Personal venue",
        format: "in_person",
        language: "english",
        audienceSize: 100,
        audienceDescription: "Potentially identifying audience description",
        edition: "Named edition",
      },
      ask: {
        proposedTheme: "Personal theme",
        objective: "Potentially identifying objective",
        otherSpeakers: "Named person",
        recording: false,
      },
      logistics: {
        travel: "host_covered",
        honorarium: "discuss",
        invitationLetter: true,
        visaLetter: false,
        governmentProtocol: false,
        otherPrincipals: false,
        securityConsiderations: "Sensitive logistics",
        contactName: "Personal Contact",
        contactPhone: "+233211111111",
      },
      consent: {
        dataProcessing: true,
        authorityToInvite: true,
        version: "2023-01",
      },
      state: "archived",
      flags: [
        {
          flagId: `${requestId}-flag`,
          type: "unverified",
          severity: "review",
          detail: "Potentially identifying detail",
          raisedAt: createdAt,
          clearanceReason: "Potentially identifying clearance",
        },
      ],
      assignedTo: "desk-person",
      assignedAt: createdAt,
      assignedBy: "principal-person",
      protocolNoteConfiguration: { configuredBy: "desk-person" },
      createdAt,
      updatedAt: createdAt,
    });
    await database.collection("protocol_requests").insertMany([
      request("retention-expired", expiredAt),
      request("retention-current", currentAt),
      {
        ...request("retention-held", expiredAt),
        retention: { hold: true, status: "held" },
      },
      {
        ...request("retention-stale", expiredAt),
        retention: {
          status: "processing",
          processingAt: new Date("2026-08-10T08:00:00.000Z"),
          lockToken: "abandoned-lock",
        },
      },
    ]);
    await database.collection("protocol_request_notes").insertMany([
      {
        noteId: "retention-expired-note",
        requestId: "retention-expired",
        body: "Personal note",
        authorId: "desk-person",
        authorRole: "desk_officer",
        createdAt: expiredAt,
      },
      {
        noteId: "retention-current-note",
        requestId: "retention-current",
        body: "Current note",
        authorId: "desk-person",
        authorRole: "desk_officer",
        createdAt: currentAt,
      },
    ]);
    await database.collection("protocol_request_events").insertOne({
      eventId: "retention-expired-event",
      requestId: "retention-expired",
      category: "action",
      fromState: "delivered",
      toState: "archived",
      actorId: "principal-person",
      actorRole: "principal",
      reason: "Immutable lifecycle evidence",
      occurredAt: expiredAt,
    });
    await database.collection("correspondence").insertOne({
      correspondenceId: "retention-expired-correspondence",
      requestId: "retention-expired",
      reference: "PD-2023-IRED",
      template: "follow-up",
      locale: "en-GB",
      recipient: "personal@example.test",
      status: "failed",
      attempts: 2,
      availableAt: expiredAt,
      createdAt: expiredAt,
      providerMessageId: "provider-personal-id",
      lastError: "Provider personal detail",
    });

    const service = new ProtocolDeskRetentionService(mongoose.connection);
    const firstRetention = await service.run(now);
    const retentionFailures = await database
      .collection("protocol_requests")
      .find({ "retention.status": "failed" })
      .project({ requestId: 1, "retention.lastError": 1 })
      .toArray();
    expect(firstRetention, JSON.stringify(retentionFailures)).toEqual({
      pseudonymised: 2,
      failed: 0,
    });
    await expect(
      database
        .collection("protocol_requests")
        .findOne({ requestId: "retention-expired" }),
    ).resolves.toMatchObject({
      requester: {
        name: "Removed after retention period",
        role: "Removed after retention period",
        email: "removed@invalid.example",
      },
      organisation: { name: "Removed after retention period" },
      engagement: {
        eventName: "Removed after retention period",
        audienceDescription: "Removed after retention period",
      },
      ask: {
        proposedTheme: "Removed after retention period",
        objective: "Removed after retention period",
      },
      logistics: {
        contactName: "Removed after retention period",
        contactPhone: "Removed after retention period",
      },
      flags: [
        expect.objectContaining({
          detail: "Removed after retention period",
          clearanceReason: "Removed after retention period",
        }),
      ],
      retention: {
        status: "pseudonymised",
        policyVersion: "protocol-desk-36-months-v1",
        cutoff: new Date("2023-08-10T10:00:00.000Z"),
        pseudonymisedAt: now,
      },
    });
    const expired = await database
      .collection("protocol_requests")
      .findOne({ requestId: "retention-expired" });
    expect(expired).not.toHaveProperty("requester.phone");
    expect(expired).not.toHaveProperty("protocolNoteConfiguration");
    await expect(
      database
        .collection("protocol_request_notes")
        .countDocuments({ requestId: "retention-expired" }),
    ).resolves.toBe(0);
    await expect(
      database
        .collection("protocol_request_notes")
        .countDocuments({ requestId: "retention-current" }),
    ).resolves.toBe(1);
    await expect(
      database
        .collection("protocol_request_events")
        .findOne({ eventId: "retention-expired-event" }),
    ).resolves.toMatchObject({
      actorId: "principal-person",
      reason: "Immutable lifecycle evidence",
    });
    await expect(
      database.collection("correspondence").findOne({
        correspondenceId: "retention-expired-correspondence",
      }),
    ).resolves.toMatchObject({
      recipient: "removed@invalid.example",
      status: "cancelled",
    });
    const retainedCorrespondence = await database
      .collection("correspondence")
      .findOne({ correspondenceId: "retention-expired-correspondence" });
    expect(retainedCorrespondence).not.toHaveProperty("providerMessageId");
    expect(retainedCorrespondence).not.toHaveProperty("lastError");
    await expect(
      database
        .collection("protocol_requests")
        .findOne({ requestId: "retention-current" }),
    ).resolves.toMatchObject({
      requester: { email: "retention-current@example.test" },
    });
    await expect(
      database
        .collection("protocol_requests")
        .findOne({ requestId: "retention-held" }),
    ).resolves.toMatchObject({
      requester: { email: "retention-held@example.test" },
      retention: { hold: true, status: "held" },
    });
    await expect(service.run(now)).resolves.toEqual({
      pseudonymised: 0,
      failed: 0,
    });

    await database.collection("protocol_requests").updateOne(
      { requestId: "retention-expired" },
      {
        $set: {
          requester: {
            name: "Restored Personal Name",
            role: "Restored Role",
            email: "restored@example.test",
          },
        },
        $unset: { retention: "" },
      },
    );
    await expect(service.run(now)).resolves.toEqual({
      pseudonymised: 1,
      failed: 0,
    });
    await expect(
      database
        .collection("protocol_requests")
        .findOne({ requestId: "retention-expired" }),
    ).resolves.toMatchObject({
      requester: { email: "removed@invalid.example" },
      retention: { status: "pseudonymised" },
    });
  });

  it("denies update and deletion of Protocol Desk events to an append-only runtime identity", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const roleName = "amanorProtocolEventAppender";
    const userName = "amanor_protocol_runtime";
    const password = "amanor-protocol-runtime-test-password";
    await database.command({
      createRole: roleName,
      privileges: [
        {
          resource: { db: databaseName, collection: "protocol_request_events" },
          actions: ["find", "insert"],
        },
      ],
      roles: [],
    });
    await database.command({
      createUser: userName,
      pwd: password,
      roles: [{ role: roleName, db: databaseName }],
    });
    const runtime = await mongoose
      .createConnection(
        `mongodb://${userName}:${password}@127.0.0.1:27028/${databaseName}?authSource=${databaseName}&replicaSet=rs0&directConnection=true`,
        { serverSelectionTimeoutMS: 10_000 },
      )
      .asPromise();
    try {
      const events = runtime.db?.collection("protocol_request_events");
      if (!events) throw new Error("Runtime event collection is unavailable");
      const eventId = randomUUID();
      await expect(
        events.insertOne({
          eventId,
          requestId: randomUUID(),
          category: "action",
          fromState: null,
          toState: "received",
          actorId: "runtime-proof",
          actorRole: "system",
          reason: "Append-only privilege proof",
          occurredAt: new Date(),
        }),
      ).resolves.toMatchObject({ acknowledged: true });
      await expect(events.findOne({ eventId })).resolves.toMatchObject({
        eventId,
      });
      await expect(
        events.updateOne({ eventId }, { $set: { reason: "tampered" } }),
      ).rejects.toThrow(/not authorized|unauthorized/iu);
      await expect(events.deleteOne({ eventId })).rejects.toThrow(
        /not authorized|unauthorized/iu,
      );
      await expect(events.findOne({ eventId })).resolves.toMatchObject({
        reason: "Append-only privilege proof",
      });
    } finally {
      await runtime.close();
    }
  });

  it("denies database access in both directions across The Room credential boundary", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const adminDatabase = mongoose.connection.useDb("admin").db;
    if (!adminDatabase) throw new Error("Admin database is not connected");
    const roomDatabaseName = `${databaseName}_room`;
    const applicationRole = "amanorApplicationBoundary";
    const roomRole = "amanorRoomBoundary";
    const applicationUser = "amanor_application_boundary";
    const roomUser = "amanor_room_boundary";
    const password = "amanor-boundary-test-password";
    await adminDatabase.command({
      createRole: applicationRole,
      privileges: [
        {
          resource: {
            db: databaseName,
            collection: "boundary_application_records",
          },
          actions: ["find", "insert"],
        },
      ],
      roles: [],
    });
    await adminDatabase.command({
      createRole: roomRole,
      privileges: [
        {
          resource: { db: roomDatabaseName, collection: "room_enquiries" },
          actions: ["find", "insert", "update", "remove"],
        },
        {
          resource: { db: roomDatabaseName, collection: "room_events" },
          actions: ["find", "insert"],
        },
        {
          resource: {
            db: roomDatabaseName,
            collection: "room_key_manifests",
          },
          actions: ["find"],
        },
      ],
      roles: [],
    });
    await adminDatabase.command({
      createUser: applicationUser,
      pwd: password,
      roles: [{ role: applicationRole, db: "admin" }],
    });
    await adminDatabase.command({
      createUser: roomUser,
      pwd: password,
      roles: [{ role: roomRole, db: "admin" }],
    });
    const base = "127.0.0.1:27028";
    const options = "authSource=admin&replicaSet=rs0&directConnection=true";
    const application = await mongoose
      .createConnection(
        `mongodb://${applicationUser}:${password}@${base}/${databaseName}?${options}`,
        { serverSelectionTimeoutMS: 10_000 },
      )
      .asPromise();
    const room = await mongoose
      .createConnection(
        `mongodb://${roomUser}:${password}@${base}/${roomDatabaseName}?${options}`,
        { serverSelectionTimeoutMS: 10_000 },
      )
      .asPromise();
    try {
      await expect(
        application.db
          ?.collection("boundary_application_records")
          .insertOne({ proof: true }),
      ).resolves.toMatchObject({ acknowledged: true });
      await expect(
        room.db
          ?.collection("room_enquiries")
          .insertOne({ ciphertext: "proof" }),
      ).resolves.toMatchObject({ acknowledged: true });

      await expect(
        application
          .useDb(roomDatabaseName)
          .db?.collection("room_enquiries")
          .findOne({}),
      ).rejects.toThrow(/not authorized|unauthorized/iu);
      await expect(
        room
          .useDb(databaseName)
          .db?.collection("boundary_application_records")
          .findOne({}),
      ).rejects.toThrow(/not authorized|unauthorized/iu);
      await expect(
        room.db?.collection("content_versions").insertOne({ proof: true }),
      ).rejects.toThrow(/not authorized|unauthorized/iu);
      await expect(
        room.db?.collection("room_events").insertOne({ eventId: randomUUID() }),
      ).resolves.toMatchObject({ acknowledged: true });
      await expect(
        room.db
          ?.collection("room_events")
          .updateOne({}, { $set: { proof: true } }),
      ).rejects.toThrow(/not authorized|unauthorized/iu);
    } finally {
      await Promise.all([application.close(), room.close()]);
      await mongoose.connection.useDb(roomDatabaseName).dropDatabase();
    }
  });

  it("enforces a distributed fixed-window limit without storing raw identifiers", async () => {
    const limiter = new RateLimitService(
      mongoose.connection,
      new ConfigService({
        RATE_LIMIT_PEPPER: "a-rate-limit-pepper-that-is-long-enough",
      }),
    );
    const now = new Date("2026-08-09T19:00:00.000Z");
    await expect(
      limiter.consume("login", "person@example.test", 2, 60_000, now),
    ).resolves.toEqual(
      expect.objectContaining({ allowed: true, remaining: 1 }),
    );
    await expect(
      limiter.consume("login", "person@example.test", 2, 60_000, now),
    ).resolves.toEqual(
      expect.objectContaining({ allowed: true, remaining: 0 }),
    );
    await expect(
      limiter.consume("login", "person@example.test", 2, 60_000, now),
    ).resolves.toEqual(
      expect.objectContaining({ allowed: false, remaining: 0 }),
    );
    const stored = await mongoose.connection.db
      ?.collection("rate_limits")
      .findOne({});
    expect(stored?.key).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(stored)).not.toContain("person@example.test");
  });

  it("persists governed media while withholding consent metadata from public reads", async () => {
    const repository = new MediaRepository(mongoose.connection);
    const asset = {
      assetId: randomUUID(),
      publicId: "amanor/portraits/portrait-1",
      resourceType: "image" as const,
      secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/portrait.jpg",
      format: "jpg",
      bytes: 1_000,
      width: 1200,
      height: 800,
      version: 1,
      altText: {
        "en-GB": "Portrait",
        "fr-FR": "Portrait FR",
        status: { "en-GB": "current" as const, "fr-FR": "current" as const },
        sourceUpdatedAt: new Date(),
      },
      credit: "Photographer",
      sourceRef: "source-1",
      consentReference: "consent-private",
      licence: "licensed",
      transformationPolicy: "portrait" as const,
      retentionPolicy: "standard" as const,
      legalHold: false,
      status: "active" as const,
      createdBy: "editor-1",
      createdAt: new Date(),
    };
    await repository.create(asset);
    const publicAsset = await repository.findPublic(asset.assetId);
    expect(publicAsset).toEqual(
      expect.objectContaining({
        assetId: asset.assetId,
        secureUrl: asset.secureUrl,
      }),
    );
    expect(publicAsset).not.toHaveProperty("consentReference");
    expect(publicAsset).not.toHaveProperty("createdBy");
    await expect(
      repository.list({ limit: 25, folder: "portraits" }),
    ).resolves.toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ assetId: asset.assetId })],
      }),
    );
    await expect(
      repository.updateMetadata(
        asset.assetId,
        {
          altText: asset.altText,
          credit: "Updated credit",
          sourceRef: asset.sourceRef,
          consentReference: asset.consentReference,
          licence: asset.licence,
          transformationPolicy: "portrait",
          retentionPolicy: "standard",
          legalHold: false,
          focalPoint: { x: 0.2, y: 0.8 },
        },
        "editor-2",
        new Date(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        credit: "Updated credit",
        updatedBy: "editor-2",
        focalPoint: { x: 0.2, y: 0.8 },
      }),
    );
    const referencedPagePayload = { heroAssetId: asset.assetId };
    await mongoose.connection.db?.collection("content_versions").insertOne({
      documentType: "page",
      documentId: "media-reference-test",
      version: 1,
      state: "published",
      payload: referencedPagePayload,
    });
    const referencedPagePublication = {
      documentType: "page",
      documentId: "media-reference-test",
      version: 1,
      locale: "en-GB",
      publishedAt: new Date(),
    } as const;
    await mongoose.connection.db
      ?.collection("publications")
      .insertOne(referencedPagePublication);
    if (mongoose.connection.db)
      await materializeStructuredPublication(
        mongoose.connection.db,
        referencedPagePublication,
        referencedPagePayload,
      );
    await expect(
      repository.isReferencedByPublication(asset.assetId),
    ).resolves.toBe(true);
    await expect(repository.inventory()).resolves.toEqual(
      expect.objectContaining({
        assets: [expect.objectContaining({ assetId: asset.assetId })],
        publishedAssetIds: new Set([asset.assetId]),
      }),
    );
    await expect(
      repository.markDeleted(asset.assetId, new Date()),
    ).resolves.toBe(true);
    await expect(repository.findPublic(asset.assetId)).resolves.toBeNull();
  });

  it("fails publication against inactive media and succeeds only after the governed asset is active", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const assetId = randomUUID();
    await database.collection("media_assets").insertOne({
      assetId,
      publicId: "amanor/archive/social-card",
      resourceType: "image",
      status: "deleted",
      createdAt: new Date(),
    });
    const repository = new CmsRepository(mongoose.connection);
    const service = new CmsService(
      repository,
      new MediaReferenceService(new MediaRepository(mongoose.connection)),
    );
    const localized = (english: string, french: string) => ({
      "en-GB": english,
      "fr-FR": french,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date(),
    });
    const documentId = `media-page-${randomUUID()}`;
    const draft = await service.createDraft(
      "page",
      documentId,
      {
        slug: "/privacy",
        title: localized("Privacy", "Confidentialité"),
        summary: localized("Privacy summary", "Résumé de confidentialité"),
        sections: [
          {
            key: "opening",
            body: localized("English body", "Corps français"),
          },
        ],
        seoTitle: localized("Privacy", "Confidentialité"),
        seoDescription: localized(
          "Privacy details",
          "Détails de confidentialité",
        ),
        ogImage: assetId,
      },
      { id: "media-editor", roles: ["editor"] },
    );
    const submitted = await service.transition(
      "page",
      documentId,
      draft.version,
      "submit",
      { id: "media-editor", roles: ["editor"] },
      {},
    );
    const approved = await service.transition(
      "page",
      documentId,
      submitted.version,
      "approve",
      { id: "media-reviewer", roles: ["reviewer"] },
      { policySensitive: false },
    );

    await expect(
      service.publish("page", documentId, approved.version, "en-GB", {
        id: "media-reviewer",
        roles: ["reviewer"],
      }),
    ).rejects.toThrow(/ogImage.*not active/iu);
    await expect(
      repository.findPublication("page", documentId, "en-GB"),
    ).resolves.toBeNull();

    await database
      .collection("media_assets")
      .updateOne({ assetId }, { $set: { status: "active" } });
    await expect(
      service.publish("page", documentId, approved.version, "en-GB", {
        id: "media-reviewer",
        roles: ["reviewer"],
      }),
    ).resolves.toEqual(
      expect.objectContaining({ documentId, locale: "en-GB" }),
    );
  });

  it("atomically excludes publication races with manual and retention retirement", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const mediaRepository = new MediaRepository(mongoose.connection);
    const contentRepository = new CmsRepository(mongoose.connection);
    const service = new CmsService(
      contentRepository,
      new MediaReferenceService(mediaRepository),
    );
    const localized = (english: string, french: string) => ({
      "en-GB": english,
      "fr-FR": french,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date(),
    });

    for (const mode of ["manual", "retention"] as const) {
      const assetId = randomUUID();
      const documentId = `${mode}-race-${randomUUID()}`;
      await database.collection("media_assets").insertOne({
        assetId,
        publicId: `amanor/archive/${mode}-race`,
        resourceType: "image",
        status: "active",
        retentionPolicy: mode === "retention" ? "expires" : "standard",
        ...(mode === "retention"
          ? { retainUntil: new Date("2026-08-09T00:00:00.000Z") }
          : {}),
        legalHold: false,
        createdAt: new Date(),
      });
      await database.collection("content_versions").insertOne({
        documentType: "page",
        documentId,
        version: 1,
        state: "approved",
        authorId: "race-editor",
        reviewerId: "race-reviewer",
        payload: {
          slug: "/privacy",
          title: localized("Privacy", "Confidentialité"),
          summary: localized("Privacy summary", "Résumé de confidentialité"),
          sections: [
            {
              key: "opening",
              body: localized("English body", "Corps français"),
            },
          ],
          seoTitle: localized("Privacy", "Confidentialité"),
          seoDescription: localized(
            "Privacy details",
            "Détails de confidentialité",
          ),
          ogImage: assetId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const now = new Date("2026-08-10T12:00:00.000Z");
      const lockToken = randomUUID();
      const [publicationResult, retirementResult] = await Promise.allSettled([
        service.publish("page", documentId, 1, "en-GB", {
          id: "race-reviewer",
          roles: ["reviewer"],
        }),
        mode === "manual"
          ? mediaRepository.claimManualDeletion(assetId, now, lockToken)
          : mediaRepository.claimRetentionIfUnreferenced(
              assetId,
              now,
              new Date("2026-08-10T11:00:00.000Z"),
              lockToken,
              new Date("2026-08-11T12:00:00.000Z"),
            ),
      ]);
      const publication = await contentRepository.findPublication(
        "page",
        documentId,
        "en-GB",
      );
      const asset = await mediaRepository.find(assetId);

      if (publication) {
        expect(publicationResult.status).toBe("fulfilled");
        expect(retirementResult).toEqual({
          status: "fulfilled",
          value: mode === "retention" ? "referenced" : null,
        });
        expect(asset?.status).toBe("active");
      } else {
        expect(publicationResult.status).toBe("rejected");
        expect(retirementResult.status).toBe("fulfilled");
        expect(
          retirementResult.status === "fulfilled" && retirementResult.value,
        ).toEqual(expect.objectContaining({ status: "quarantined" }));
        expect(asset?.status).toBe("quarantined");
        await mediaRepository.restoreManualDeletion(assetId, lockToken);
      }

      await database.collection("publications").deleteMany({ documentId });
      await database.collection("content_versions").deleteMany({ documentId });
      await database.collection("media_assets").deleteOne({ assetId });
      await database
        .collection<{ _id: string }>("media_reference_locks")
        .deleteOne({ _id: assetId });
    }
  });

  it("persists sessions and enforces compare-and-swap rotation plus family revocation", async () => {
    const repository = new AuthRepository(mongoose.connection);
    await mongoose.connection.db?.collection("users").insertOne({
      userId: "user-1",
      emailCanonical: "user-1@example.test",
      passwordHash: "not-used-in-this-integration-test",
      roles: ["editor"],
      roleVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const session: Session = {
      sessionId: randomUUID(),
      familyId: randomUUID(),
      userId: "user-1",
      roles: ["editor"],
      roleVersion: 1,
      currentRefreshHash: "a".repeat(64),
      csrfHash: "b".repeat(64),
      authenticationMethods: ["pwd", "totp"],
      expiresAt: new Date(Date.now() + 60_000),
    };
    await repository.createSession(session);
    await expect(
      repository.findBySessionId(session.sessionId),
    ).resolves.toEqual(
      expect.objectContaining({
        sessionId: session.sessionId,
        currentRefreshHash: "a".repeat(64),
      }),
    );
    await expect(repository.listSessionsForUser("user-1")).resolves.toEqual([
      expect.objectContaining({
        sessionId: session.sessionId,
        familyId: session.familyId,
      }),
    ]);
    await expect(
      repository.rotate({
        sessionId: session.sessionId,
        familyId: session.familyId,
        expectedCurrentHash: "a".repeat(64),
        nextHash: "c".repeat(64),
        consumedHash: "a".repeat(64),
        rotatedAt: new Date(),
        expiresAt: session.expiresAt,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.rotate({
        sessionId: session.sessionId,
        familyId: session.familyId,
        expectedCurrentHash: "a".repeat(64),
        nextHash: "d".repeat(64),
        consumedHash: "a".repeat(64),
        rotatedAt: new Date(),
        expiresAt: session.expiresAt,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.wasRefreshHashConsumed(session.sessionId, "a".repeat(64)),
    ).resolves.toBe(true);
    let currentHash = "c".repeat(64);
    for (let index = 0; index < 13; index += 1) {
      const nextHash = index.toString(16).padStart(64, "0");
      await expect(
        repository.rotate({
          sessionId: session.sessionId,
          familyId: session.familyId,
          expectedCurrentHash: currentHash,
          nextHash,
          consumedHash: currentHash,
          rotatedAt: new Date(Date.now() + index + 1),
          expiresAt: session.expiresAt,
        }),
      ).resolves.toBe(true);
      currentHash = nextHash;
    }
    await expect(
      mongoose.connection.db
        ?.collection("refresh_token_consumptions")
        .countDocuments({ sessionId: session.sessionId }),
    ).resolves.toBe(14);
    await expect(
      repository.wasRefreshHashConsumed(session.sessionId, "a".repeat(64)),
    ).resolves.toBe(true);

    await repository.revokeFamily(
      session.familyId,
      "integration_test",
      new Date(),
    );
    await expect(
      repository.findBySessionId(session.sessionId),
    ).resolves.toEqual(
      expect.objectContaining({ revokeReason: "integration_test" }),
    );
    await expect(
      repository.revokeUserSession(
        "different-user",
        session.sessionId,
        "forbidden",
        new Date(),
      ),
    ).resolves.toBe(false);

    await expect(repository.listUsers()).resolves.toEqual([
      expect.objectContaining({
        userId: "user-1",
        emailCanonical: "user-1@example.test",
        roles: ["editor"],
        roleVersion: 1,
      }),
    ]);
    await expect(
      repository.updateUserRoles("user-1", 1, ["reviewer"]),
    ).resolves.toBe(true);
    await expect(
      repository.updateUserRoles("user-1", 1, ["security_admin"]),
    ).resolves.toBe(false);
    const disabledAt = new Date();
    await expect(
      repository.setUserDisabled("user-1", 2, true, disabledAt),
    ).resolves.toBe(true);
    const activeSession: Session = {
      ...session,
      sessionId: randomUUID(),
      familyId: randomUUID(),
      currentRefreshHash: "e".repeat(64),
      csrfHash: "f".repeat(64),
    };
    await repository.createSession(activeSession);
    await repository.revokeSessionsForUser(
      "user-1",
      "user_disabled",
      disabledAt,
    );
    await expect(repository.findUserById("user-1")).resolves.toEqual(
      expect.objectContaining({
        roles: ["reviewer"],
        roleVersion: 3,
        disabledAt,
      }),
    );
    await expect(
      repository.findBySessionId(activeSession.sessionId),
    ).resolves.toEqual(
      expect.objectContaining({ revokeReason: "user_disabled" }),
    );

    const invitationHash = "invitation-hash-for-integration";
    const invitationExpiresAt = new Date(Date.now() + 60_000);
    await repository.createInvitedUser({
      userId: "invited-user",
      emailCanonical: "invited@example.test",
      passwordHash: "pending-password-hash",
      roles: ["editor"],
      invitationTokenHash: invitationHash,
      invitationExpiresAt,
      invitedAt: new Date(),
      invitedBy: "security-1",
      mfa: {
        encryptedSecret: "encrypted",
        iv: "iv",
        authTag: "tag",
      },
    });
    await expect(
      repository.findInvitationByHash(invitationHash),
    ).resolves.toEqual(
      expect.objectContaining({
        userId: "invited-user",
        invitationTokenHash: invitationHash,
      }),
    );
    const priorMfa = {
      encryptedSecret: "encrypted",
      iv: "iv",
      authTag: "tag",
    };
    const migratedMfa = {
      encryptedSecret: "active-encrypted",
      iv: "active-iv",
      authTag: "active-tag",
    };
    await expect(
      repository.rotateMfaEncryption({
        userId: "invited-user",
        expected: priorMfa,
        next: migratedMfa,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.rotateMfaEncryption({
        userId: "invited-user",
        expected: priorMfa,
        next: migratedMfa,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.findInvitationByHash(invitationHash),
    ).resolves.toEqual(expect.objectContaining({ mfa: migratedMfa }));
    await expect(repository.listMfaCiphertexts(10)).resolves.toContainEqual(
      migratedMfa,
    );
    const acceptedAt = new Date();
    await expect(
      repository.acceptInvitation({
        userId: "invited-user",
        invitationTokenHash: invitationHash,
        passwordHash: "accepted-password-hash",
        matchedMfaStep: 42,
        recoveryCodeHashes: ["recovery-hash-one", "recovery-hash-two"],
        acceptedAt,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.acceptInvitation({
        userId: "invited-user",
        invitationTokenHash: invitationHash,
        passwordHash: "replayed-password-hash",
        matchedMfaStep: 43,
        acceptedAt,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.findInvitationByHash(invitationHash),
    ).resolves.toBeNull();
    await expect(
      repository.consumeRecoveryCode("invited-user", ["recovery-hash-one"]),
    ).resolves.toBe(true);
    await expect(
      repository.consumeRecoveryCode("invited-user", ["recovery-hash-one"]),
    ).resolves.toBe(false);
    await expect(
      repository.replaceRecoveryCodesAndNotify({
        userId: "invited-user",
        emailCanonical: "invited@example.test",
        recoveryCodeHashes: ["replacement-hash-one", "replacement-hash-two"],
        notificationId: "notification-rotation",
        occurredAt: acceptedAt,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.consumeRecoveryCode("invited-user", ["recovery-hash-two"]),
    ).resolves.toBe(false);
    const recoverySession: Session = {
      sessionId: "invited-session",
      familyId: "invited-family",
      userId: "invited-user",
      roles: ["editor"],
      roleVersion: 1,
      currentRefreshHash: "e".repeat(64),
      csrfHash: "f".repeat(64),
      authenticationMethods: ["pwd", "totp"],
      expiresAt: new Date(Date.now() + 60_000),
    };
    await repository.createSession(recoverySession);
    const recoveredAt = new Date();
    await expect(
      repository.recoverWithCode({
        userId: "invited-user",
        candidateHashes: ["replacement-hash-one"],
        emailCanonical: "invited@example.test",
        notificationId: "notification-recovery",
        occurredAt: recoveredAt,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.recoverWithCode({
        userId: "invited-user",
        candidateHashes: ["replacement-hash-one"],
        emailCanonical: "invited@example.test",
        notificationId: "notification-replay",
        occurredAt: recoveredAt,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.findBySessionId(recoverySession.sessionId),
    ).resolves.toEqual(
      expect.objectContaining({
        revokedAt: recoveredAt,
        revokeReason: "mfa_recovery",
      }),
    );
    await expect(
      mongoose.connection.db
        ?.collection("auth_notification_jobs")
        .find({}, { projection: { _id: 0, notificationId: 1, type: 1 } })
        .sort({ notificationId: 1 })
        .toArray(),
    ).resolves.toEqual([
      {
        notificationId: "notification-recovery",
        type: "account_recovered",
      },
      {
        notificationId: "notification-rotation",
        type: "recovery_codes_rotated",
      },
    ]);
    await expect(repository.listUsers()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "invited-user",
          invitationAcceptedAt: acceptedAt,
        }),
      ]),
    );
    await repository.appendEvent({
      eventId: "audit-event-2",
      type: "role_changed",
      actorId: "security-1",
      subjectId: "invited-user",
      sessionId: "must-not-project",
      occurredAt: new Date("2026-08-10T12:00:00.000Z"),
      ipHash: "must-not-project",
      outcome: "success",
      reason: "administrative_change",
    });
    await repository.appendEvent({
      eventId: "audit-event-1",
      type: "login_failed",
      subjectId: "invited-user",
      occurredAt: new Date("2026-08-10T11:00:00.000Z"),
      outcome: "failure",
      reason: "invalid_credentials",
    });
    const firstAuditPage = await repository.listEvents(1);
    expect(firstAuditPage.items).toEqual([
      expect.objectContaining({ eventId: "audit-event-2" }),
    ]);
    expect(firstAuditPage.items[0]).not.toHaveProperty("sessionId");
    expect(firstAuditPage.items[0]).not.toHaveProperty("ipHash");
    expect(firstAuditPage.nextCursor).toBeTruthy();
    await expect(
      repository.listEvents(1, firstAuditPage.nextCursor),
    ).resolves.toEqual({
      items: [expect.objectContaining({ eventId: "audit-event-1" })],
    });
    await expect(repository.verifyEventChain()).resolves.toEqual(
      expect.objectContaining({ status: "valid", checkedEvents: 2 }),
    );
    const authDatabase = mongoose.connection.db;
    if (!authDatabase) throw new Error("Test database is not connected");
    await authDatabase
      .collection("auth_events")
      .updateOne(
        { eventId: "audit-event-1" },
        { $set: { reason: "tampered" } },
      );
    await expect(repository.verifyEventChain()).resolves.toEqual(
      expect.objectContaining({ status: "invalid" }),
    );
  });

  it("migrates a retiring session pepper and revokes the family when that token is later replayed", async () => {
    const repository = new AuthRepository(mongoose.connection);
    const activePepper =
      "integration-active-session-pepper-that-is-longer-than-32-bytes";
    const retiringPepper =
      "integration-retiring-session-pepper-that-is-longer-than-32-bytes";
    const original = createRefreshToken(retiringPepper);
    const session: Session = {
      sessionId: original.sessionId,
      familyId: randomUUID(),
      userId: "long-rotation-user",
      roles: ["editor"],
      roleVersion: 1,
      currentRefreshHash: original.hash,
      csrfHash: "d".repeat(64),
      authenticationMethods: ["pwd", "totp"],
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    await repository.createSession(session);
    const migrated = await rotateSession(
      repository,
      original.raw,
      [activePepper, retiringPepper],
      new Date("2026-08-10T00:00:59Z"),
    );
    const migratedSecret = parseRefreshToken(migrated.refreshToken).secret;
    expect(migrated.session.currentRefreshHash).toBe(
      hashRefreshSecret(migratedSecret, activePepper),
    );
    let current = migrated.refreshToken;
    for (let index = 1; index < 14; index += 1) {
      const result = await rotateSession(
        repository,
        current,
        [activePepper, retiringPepper],
        new Date(`2026-08-10T00:01:${index.toString().padStart(2, "0")}Z`),
      );
      current = result.refreshToken;
    }
    await expect(
      mongoose.connection.db
        ?.collection("refresh_token_consumptions")
        .countDocuments({ sessionId: session.sessionId }),
    ).resolves.toBe(14);
    await expect(
      rotateSession(
        repository,
        original.raw,
        [activePepper, retiringPepper],
        new Date("2026-08-10T00:02:00Z"),
      ),
    ).rejects.toThrow(/reuse/iu);
    await expect(
      repository.findBySessionId(session.sessionId),
    ).resolves.toEqual(
      expect.objectContaining({ revokeReason: "refresh_token_reuse" }),
    );
  });

  it("persists the editorial workflow, audit chain, publication and outbox atomically", async () => {
    const repository = new CmsRepository(mongoose.connection);
    const service = new CmsService(repository);
    const payload = {
      ref: "official-record-1",
      title: "Official record",
      publisher: "Institution",
      accessedAt: new Date(),
      type: "official" as const,
      notes: "Confidential editorial context",
    };
    const draft = await service.createDraft(
      "source",
      "official-record-1",
      payload,
      { id: "editor-1", roles: ["editor"] },
    );
    await service.createDraft(
      "source",
      "secondary-record",
      { ...payload, ref: "secondary-record" },
      { id: "editor-1", roles: ["editor"] },
    );
    const firstDocumentPage = await repository.listDocuments("source", 1);
    expect(firstDocumentPage).toEqual({
      items: [
        expect.objectContaining({
          documentId: "official-record-1",
          latestVersion: 1,
          state: "draft",
        }),
      ],
      nextCursor: "official-record-1",
    });
    await expect(
      repository.listDocuments("source", 1, firstDocumentPage.nextCursor),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          documentId: "secondary-record",
          latestVersion: 1,
          state: "draft",
        }),
      ],
    });
    await expect(
      repository.findPublished("source", "official-record-1", "en-GB"),
    ).resolves.toBeNull();
    const submitted = await service.transition(
      "source",
      "official-record-1",
      draft.version,
      "submit",
      { id: "editor-1", roles: ["editor"] },
      {},
    );
    const approved = await service.transition(
      "source",
      "official-record-1",
      submitted.version,
      "approve",
      { id: "reviewer-2", roles: ["reviewer"] },
      { policySensitive: true },
    );
    await service.publish(
      "source",
      "official-record-1",
      approved.version,
      "en-GB",
      { id: "reviewer-2", roles: ["reviewer"] },
    );
    await expect(
      repository.findPublished("source", "official-record-1", "en-GB"),
    ).resolves.toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ ref: "official-record-1" }),
      }),
    );
    await expect(
      repository.findPublished("source", "official-record-1", "fr-FR"),
    ).resolves.toBeNull();
    const sourceRegister = await repository.listPublicSources(
      "en-GB",
      25,
      undefined,
      "official",
    );
    expect(sourceRegister.items).toEqual([
      expect.objectContaining({
        ref: "official-record-1",
        title: "Official record",
      }),
    ]);
    expect(sourceRegister.items[0]).not.toHaveProperty("notes");
    await expect(repository.listPublishedForSourceAudit()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: "source",
          documentId: "official-record-1",
          locale: "en-GB",
          version: 1,
          payload: expect.objectContaining({ ref: "official-record-1" }),
        }),
      ]),
    );

    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    await expect(
      database
        .collection("publications")
        .findOne({ documentId: "official-record-1" }),
    ).resolves.toEqual(
      expect.objectContaining({ version: 1, locale: "en-GB" }),
    );
    await expect(
      database.collection("sources").findOne({
        stableId: "official-record-1",
      }),
    ).resolves.toMatchObject({
      documentType: "source",
      schemaVersion: 2,
      projectionManaged: true,
      data: { ref: "official-record-1", title: "Official record" },
      locales: { "en-GB": { version: 1 } },
    });
    await expect(
      database.collection("outbox_jobs").findOne({
        idempotencyKey: "publish:source:official-record-1:en-GB:1",
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "pending" }));

    expect(
      await database
        .collection("editorial_audit")
        .countDocuments({ documentId: "official-record-1" }),
    ).toBe(4);
    await expect(
      repository.verifyAuditIntegrity("source", "official-record-1"),
    ).resolves.toEqual({
      status: "valid",
      checkedEvents: 4,
      headSequence: 4,
    });

    const replacement = await service.createDraft(
      "source",
      "official-record-1",
      { ...payload, title: "Replacement record" },
      { id: "editor-3", roles: ["editor"] },
    );
    const replacementSubmitted = await service.transition(
      "source",
      "official-record-1",
      replacement.version,
      "submit",
      { id: "editor-3", roles: ["editor"] },
      {},
    );
    const replacementApproved = await service.transition(
      "source",
      "official-record-1",
      replacementSubmitted.version,
      "approve",
      { id: "reviewer-2", roles: ["reviewer"] },
      { policySensitive: true },
    );
    await service.publish(
      "source",
      "official-record-1",
      replacementApproved.version,
      "en-GB",
      { id: "reviewer-2", roles: ["reviewer"] },
    );
    await expect(
      repository.findVersion("source", "official-record-1", 1),
    ).resolves.toEqual(expect.objectContaining({ state: "superseded" }));
    await service.rollback("source", "official-record-1", 1, "en-GB", {
      id: "reviewer-2",
      roles: ["reviewer"],
    });
    await expect(
      repository.findPublication("source", "official-record-1", "en-GB"),
    ).resolves.toEqual(expect.objectContaining({ version: 1 }));
    await expect(
      repository.findVersion("source", "official-record-1", 2),
    ).resolves.toEqual(expect.objectContaining({ state: "superseded" }));
    await expect(
      database.collection("editorial_audit").findOne({
        documentId: "official-record-1",
        action: "rolled_back",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        metadata: { locale: "en-GB", fromVersion: 2, toVersion: 1 },
      }),
    );
    await expect(
      database.collection("editorial_audit").findOne({
        documentType: "source",
        documentId: "official-record-1",
        action: "edited",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sequence: 5,
        changes: expect.arrayContaining([
          {
            path: "/title",
            before: "Official record",
            after: "Replacement record",
          },
        ]),
      }),
    );
    await service.unpublish(
      "source",
      "official-record-1",
      "en-GB",
      { id: "principal-1", roles: ["principal"] },
      new Date("2026-08-10T05:00:00Z"),
    );
    await expect(
      repository.findPublication("source", "official-record-1", "en-GB"),
    ).resolves.toBeNull();
    await expect(
      database.collection("sources").findOne({
        stableId: "official-record-1",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.verifyAuditIntegrity("source", "official-record-1"),
    ).resolves.toEqual({
      status: "valid",
      checkedEvents: 10,
      headSequence: 10,
    });
    await expect(
      database.collection("outbox_jobs").findOne({
        idempotencyKey: {
          $regex: /^unpublish:source:official-record-1:en-GB:/u,
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "pending" }));

    const restoredSource = await service.createDraft(
      "source",
      "official-record-1",
      payload,
      { id: "editor-3", roles: ["editor"] },
    );
    const restoredSourceSubmitted = await service.transition(
      "source",
      "official-record-1",
      restoredSource.version,
      "submit",
      { id: "editor-3", roles: ["editor"] },
      {},
    );
    const restoredSourceApproved = await service.transition(
      "source",
      "official-record-1",
      restoredSourceSubmitted.version,
      "approve",
      { id: "reviewer-2", roles: ["reviewer"] },
      {},
    );
    await service.publish(
      "source",
      "official-record-1",
      restoredSourceApproved.version,
      "en-GB",
      { id: "reviewer-2", roles: ["reviewer"] },
    );
    await service.publish(
      "source",
      "official-record-1",
      restoredSourceApproved.version,
      "fr-FR",
      { id: "reviewer-2", roles: ["reviewer"] },
    );
    await expect(
      database.collection("sources").findOne({
        stableId: "official-record-1",
      }),
    ).resolves.toMatchObject({
      data: { ref: "official-record-1", title: "Official record" },
      locales: {
        "en-GB": { version: restoredSourceApproved.version },
        "fr-FR": { version: restoredSourceApproved.version },
      },
    });
    const integrity = await repository.verifyStructuredProjections();
    expect(integrity).toMatchObject({ status: "valid", issues: [] });
    expect(integrity.checkedPublications).toBeGreaterThanOrEqual(4);
    expect(integrity.checkedProjections).toBeGreaterThanOrEqual(3);
    await database
      .collection("sources")
      .updateOne(
        { stableId: "official-record-1" },
        { $set: { "locales.fr-FR.version": 999 } },
      );
    await expect(repository.verifyStructuredProjections()).resolves.toEqual(
      expect.objectContaining({
        status: "invalid",
        issues: expect.arrayContaining([
          expect.stringMatching(/expected version .* found 999/iu),
        ]),
      }),
    );
    await database.collection("sources").updateOne(
      { stableId: "official-record-1" },
      {
        $set: {
          "locales.fr-FR.version": restoredSourceApproved.version,
        },
      },
    );

    const editedEvent = await database.collection("editorial_audit").findOne({
      documentType: "source",
      documentId: "official-record-1",
      action: "edited",
    });
    if (!editedEvent) throw new Error("Edited audit event was not persisted");
    await database
      .collection("editorial_audit")
      .updateOne(
        { eventId: editedEvent.eventId },
        { $set: { changes: [{ path: "/title", after: "tampered" }] } },
      );
    await expect(
      repository.verifyAuditIntegrity("source", "official-record-1"),
    ).resolves.toEqual(expect.objectContaining({ status: "invalid" }));
    await database
      .collection("editorial_audit")
      .updateOne(
        { eventId: editedEvent.eventId },
        { $set: { changes: editedEvent.changes } },
      );

    const delivery = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", delivery);
    try {
      const outbox = new RevalidationOutboxService(
        mongoose.connection,
        new ConfigService({
          WEB_REVALIDATION_URL: "https://www.example.test/api/revalidate",
          REVALIDATION_WEBHOOK_KEYS: JSON.stringify({
            current: "a-revalidation-secret-that-is-long-enough",
          }),
          REVALIDATION_ACTIVE_KEY_ID: "current",
        }),
      );
      await outbox.drain();
      await expect(
        database.collection("outbox_jobs").findOne({
          idempotencyKey: "publish:source:official-record-1:en-GB:1",
        }),
      ).resolves.toEqual(
        expect.objectContaining({ status: "completed", attempts: 1 }),
      );
      const [, request] = delivery.mock.calls[0] as [
        string,
        { body: string; headers: Record<string, string> },
      ];
      expect(request.headers["X-Amanor-Signature"]).toMatch(
        /^[A-Za-z0-9_-]{43}$/u,
      );
      expect(JSON.parse(request.body)).toEqual(
        expect.objectContaining({
          tags: expect.arrayContaining(["content:source:official-record-1"]),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists translation-only CMS versions without changing authoritative English fields", async () => {
    const repository = new CmsRepository(mongoose.connection);
    const service = new CmsService(repository);
    const localized = (en: string, fr: string) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date("2026-08-10T00:00:00.000Z"),
    });
    const original = {
      slug: "/terms",
      title: localized("Terms", "Conditions"),
      summary: localized("Terms summary", "Résumé des conditions"),
      sections: [
        { key: "opening", body: localized("English body", "Corps français") },
      ],
      seoTitle: localized("Terms", "Conditions"),
      seoDescription: localized("Terms detail", "Détail des conditions"),
    };
    const first = await service.createDraft(
      "page",
      "translation-permission-proof",
      original,
      { id: "page-editor", roles: ["editor"] },
    );
    const translated = {
      ...original,
      title: { ...original.title, "fr-FR": "Modalités" },
      sections: [
        {
          ...original.sections[0],
          body: {
            ...original.sections[0]!.body,
            "fr-FR": "Nouveau corps français",
          },
        },
      ],
    };
    const second = await service.createDraft(
      "page",
      "translation-permission-proof",
      translated,
      { id: "page-translator", roles: ["translator"] },
    );
    expect(second.version).toBe(first.version + 1);
    expect(second.payload).toMatchObject({
      slug: "/terms",
      title: { "en-GB": "Terms", "fr-FR": "Modalités" },
      sections: [
        {
          body: {
            "en-GB": "English body",
            "fr-FR": "Nouveau corps français",
          },
        },
      ],
    });
    await expect(
      service.createDraft(
        "page",
        "translation-permission-proof",
        {
          ...translated,
          title: { ...translated.title, "en-GB": "Altered authority" },
        },
        { id: "page-translator", roles: ["translator"] },
      ),
    ).rejects.toThrow(/only French-localized fields/i);
    await expect(
      repository.listAudit("page", "translation-permission-proof", 10),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "page-translator",
          action: "edited",
          changes: expect.arrayContaining([
            expect.objectContaining({ path: "/title/fr-FR" }),
            expect.objectContaining({ path: "/sections" }),
          ]),
        }),
      ]),
    );
  });

  it("derives policy review and fails closed on unknown Source Register references", async () => {
    const repository = new CmsRepository(mongoose.connection);
    const service = new CmsService(repository);
    const localized = (en: string, fr: string) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date("2026-08-10T00:00:00.000Z"),
    });
    const words = (count: number, stem: string) =>
      Array.from({ length: count }, (_, index) => `${stem}${index + 1}`).join(
        " ",
      );
    const source = await service.createDraft(
      "source",
      "source-1",
      {
        ref: "source-1",
        title: "Signal evidence",
        publisher: "Institution",
        accessedAt: new Date("2026-08-10T00:00:00.000Z"),
        type: "official",
      },
      { id: "source-editor", roles: ["editor"] },
    );
    const submittedSource = await service.transition(
      "source",
      "source-1",
      source.version,
      "submit",
      { id: "source-editor", roles: ["editor"] },
      {},
    );
    const approvedSource = await service.transition(
      "source",
      "source-1",
      submittedSource.version,
      "approve",
      { id: "source-reviewer", roles: ["reviewer"] },
      {},
    );
    await service.publish(
      "source",
      "source-1",
      approvedSource.version,
      "en-GB",
      { id: "source-reviewer", roles: ["reviewer"] },
    );
    const signal = await service.createDraft(
      "signal",
      "finance-call",
      {
        slug: "finance-call",
        body: localized(words(150, "signal"), words(150, "prevision")),
        publishedAt: new Date("2026-08-10T00:00:00.000Z"),
        tags: ["finance"],
        confidence: "watching",
        changeMyMind: localized("New evidence", "Nouvelles preuves"),
        sourceRefs: ["source-1"],
        approvedBy: "forged-value",
      },
      { id: "signal-author", roles: ["principal"] },
    );
    const submitted = await service.transition(
      "signal",
      "finance-call",
      signal.version,
      "submit",
      { id: "signal-author", roles: ["principal"] },
      {},
    );
    await expect(
      service.transition(
        "signal",
        "finance-call",
        submitted.version,
        "approve",
        { id: "signal-author", roles: ["principal"] },
        { policySensitive: false },
      ),
    ).rejects.toThrow(/different approver/i);
    const approved = await service.transition(
      "signal",
      "finance-call",
      submitted.version,
      "approve",
      { id: "signal-reviewer", roles: ["reviewer"] },
      { policySensitive: false },
    );
    expect(approved.payload).toEqual(
      expect.objectContaining({ approvedBy: "signal-reviewer" }),
    );
    await expect(
      service.publish("signal", "finance-call", approved.version, "en-GB", {
        id: "signal-reviewer",
        roles: ["reviewer"],
      }),
    ).resolves.toEqual(expect.objectContaining({ locale: "en-GB" }));
    await expect(service.latestPublicSignal("en-GB")).resolves.toMatchObject({
      documentId: "finance-call",
      payload: {
        slug: "finance-call",
        body: words(150, "signal"),
        sourceRefs: ["source-1"],
      },
      translation: { stale: false },
    });
    await expect(service.listPublicSignals("en-GB")).resolves.toMatchObject({
      items: [
        {
          documentId: "finance-call",
          slug: "finance-call",
          body: words(150, "signal"),
          confidence: "watching",
          sourceRefs: ["source-1"],
        },
      ],
      translation: { stale: false },
    });

    const archive = await service.createDraft(
      "archiveItem",
      "unsupported-claim",
      {
        slug: "unsupported-claim",
        title: localized("Unsupported", "Non pris en charge"),
        type: "article",
        date: new Date("2026-08-10T00:00:00.000Z"),
        language: "en",
        transcript: localized(
          "Unsupported claim transcript",
          "Transcription de l’affirmation non étayée",
        ),
        transcriptStatus: "corrected",
        sourceRefs: ["unknown-source"],
        approvedForDoctrine: false,
      },
      { id: "archive-author", roles: ["editor"] },
    );
    const archiveSubmitted = await service.transition(
      "archiveItem",
      "unsupported-claim",
      archive.version,
      "submit",
      { id: "archive-author", roles: ["editor"] },
      {},
    );
    const archiveApproved = await service.transition(
      "archiveItem",
      "unsupported-claim",
      archiveSubmitted.version,
      "approve",
      { id: "archive-reviewer", roles: ["reviewer"] },
      {},
    );
    await expect(
      service.publish(
        "archiveItem",
        "unsupported-claim",
        archiveApproved.version,
        "en-GB",
        { id: "archive-reviewer", roles: ["reviewer"] },
      ),
    ).rejects.toThrow(/not published.*unknown-source/i);
  });

  it("lists only locale-published Archive versions for public feeds", async () => {
    const repository = new CmsRepository(mongoose.connection);
    const service = new CmsService(repository);
    const localized = (en: string, fr: string) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const payload = {
      slug: "published-speech",
      title: localized("Published speech", "Discours publié"),
      type: "speech" as const,
      date: new Date("2026-08-08T00:00:00.000Z"),
      language: "en" as const,
      transcript: localized("Corrected transcript", "Transcription corrigée"),
      transcriptStatus: "corrected" as const,
      transcriptSegments: [
        {
          startSeconds: 0,
          text: localized("Opening context", "Contexte d’ouverture"),
        },
        {
          startSeconds: 90,
          text: localized("Public value", "Valeur publique"),
        },
      ],
      chapters: [
        {
          slug: "opening",
          label: localized("Opening", "Ouverture"),
          startSeconds: 0,
          endSeconds: 90,
        },
      ],
      sourceRefs: ["official-record-1"],
      corrections: [
        {
          incorrectQuote: localized("Wrong quote", "Citation erronée"),
          correction: localized("Correct wording", "Formulation correcte"),
          issuedAt: new Date("2026-08-09T00:00:00.000Z"),
          sourceRef: "official-record-1",
        },
      ],
      approvedForDoctrine: false,
    };
    const publishedDraft = await service.createDraft(
      "archiveItem",
      "published-speech",
      payload,
      { id: "archive-editor", roles: ["editor"] },
    );
    await service.createDraft(
      "archiveItem",
      "unpublished-speech",
      { ...payload, slug: "unpublished-speech" },
      { id: "archive-editor", roles: ["editor"] },
    );
    const submitted = await service.transition(
      "archiveItem",
      "published-speech",
      publishedDraft.version,
      "submit",
      { id: "archive-editor", roles: ["editor"] },
      {},
    );
    const approved = await service.transition(
      "archiveItem",
      "published-speech",
      submitted.version,
      "approve",
      { id: "archive-reviewer", roles: ["reviewer"] },
      {},
    );
    await service.publish(
      "archiveItem",
      "published-speech",
      approved.version,
      "fr-FR",
      { id: "archive-reviewer", roles: ["reviewer"] },
      new Date("2026-08-09T00:00:00.000Z"),
    );

    await expect(service.listPublicArchive("fr-FR")).resolves.toMatchObject({
      items: [
        {
          documentId: "published-speech",
          slug: "published-speech",
          title: "Discours publié",
          chapters: [
            {
              slug: "opening",
              label: "Ouverture",
              startSeconds: 0,
              endSeconds: 90,
            },
          ],
          transcriptSegments: [
            { startSeconds: 0, text: "Contexte d’ouverture" },
            { startSeconds: 90, text: "Valeur publique" },
          ],
          corrections: [
            {
              incorrectQuote: "Citation erronée",
              correction: "Formulation correcte",
              issuedAt: new Date("2026-08-09T00:00:00.000Z"),
              sourceRef: "official-record-1",
            },
          ],
        },
      ],
    });
    await expect(service.listPublicArchive("en-GB")).resolves.toMatchObject({
      items: [],
    });
    await expect(
      service.listPublicArchive("fr-FR", "valeur publique", "speech"),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ documentId: "published-speech" })],
    });
    await expect(
      service.listPublicArchive("fr-FR", "absent phrase", "speech"),
    ).resolves.toMatchObject({ items: [] });
  });

  it("lists only exact published scholars with granted consent and strips consent records", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const repository = new CmsRepository(mongoose.connection);
    const service = new CmsService(repository);
    const localized = (en: string, fr: string) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const scholar = await service.createDraft(
      "scholar",
      "consented-scholar",
      {
        name: "Ama Mensah",
        country: "GH",
        institution: "Public University",
        field: localized("Economics", "Économie"),
        cohortYear: 2024,
        status: "Active",
        story: localized("A governed story", "Un parcours contrôlé"),
        consentStatus: "granted",
        consentDate: new Date("2026-01-01T00:00:00.000Z"),
        consentVersion: "scholar-v1",
      },
      { id: "trust-author", roles: ["trust_admin"] },
    );
    const submitted = await service.transition(
      "scholar",
      "consented-scholar",
      scholar.version,
      "submit",
      { id: "trust-author", roles: ["trust_admin"] },
      {},
    );
    const approved = await service.transition(
      "scholar",
      "consented-scholar",
      submitted.version,
      "approve",
      { id: "scholar-reviewer", roles: ["reviewer"] },
      {},
    );
    await service.publish(
      "scholar",
      "consented-scholar",
      approved.version,
      "fr-FR",
      {
        id: "scholar-reviewer",
        roles: ["reviewer"],
      },
    );
    const result = await service.listPublicScholars("fr-FR");
    expect(result).toMatchObject({
      scholars: [
        {
          documentId: "consented-scholar",
          field: "Économie",
          story: "Un parcours contrôlé",
        },
      ],
      translation: { stale: false },
    });
    expect(result.scholars[0]).not.toHaveProperty("consentStatus");
    expect(result.scholars[0]).not.toHaveProperty("consentDate");
    expect(result.scholars[0]).not.toHaveProperty("consentVersion");

    await database.collection("content_versions").updateOne(
      {
        documentType: "scholar",
        documentId: "consented-scholar",
        version: approved.version,
      },
      { $set: { "payload.consentStatus": "withdrawn" } },
    );
    await expect(service.listPublicScholars("fr-FR")).resolves.toMatchObject({
      scholars: [],
    });
  });

  it("aggregates only exact locale-published Atlas versions with a deterministic 60-node cap", async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error("Test database is not connected");
    const updatedAt = new Date("2026-08-02T00:00:00.000Z");
    const localized = (en: string, fr: string, stale = false) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: {
        "en-GB": "current",
        "fr-FR": stale ? "stale" : "current",
      },
      sourceUpdatedAt: updatedAt,
    });
    const nodes = Array.from({ length: 62 }, (_, index) => {
      const documentId = `replica-atlas-${String(index).padStart(3, "0")}`;
      return {
        documentId,
        payload: {
          slug: documentId,
          label: localized(`Node ${index}`, `Nœud ${index}`, index === 0),
          institution: localized("Institution", "Institution"),
          role: localized("Role", "Rôle"),
          outcomes: [localized("Outcome", "Résultat")],
          ...(index === 0
            ? {
                homepageProof: {
                  order: 1,
                  label: localized("Configured proof", "Preuve configurée"),
                  emphasisFor: ["government", "media"],
                },
              }
            : {}),
        },
      };
    });
    await database.collection("content_versions").insertMany([
      ...nodes.map(({ documentId, payload }) => ({
        documentType: "atlasNode",
        documentId,
        version: 1,
        state: "published",
        authorId: "replica-atlas-editor",
        payload,
        createdAt: updatedAt,
        updatedAt,
      })),
      {
        documentType: "atlasNode",
        documentId: "replica-atlas-wrong-version",
        version: 1,
        state: "published",
        authorId: "replica-atlas-editor",
        payload: nodes[0]!.payload,
        createdAt: updatedAt,
        updatedAt,
      },
      {
        documentType: "atlasNode",
        documentId: "replica-atlas-draft",
        version: 1,
        state: "draft",
        authorId: "replica-atlas-editor",
        payload: nodes[0]!.payload,
        createdAt: updatedAt,
        updatedAt,
      },
    ]);
    await database.collection("publications").insertMany([
      ...nodes.map(({ documentId }) => ({
        documentType: "atlasNode",
        documentId,
        locale: "en-GB",
        version: 1,
        publishedAt: updatedAt,
        publishedBy: "replica-atlas-reviewer",
      })),
      {
        documentType: "atlasNode",
        documentId: nodes[0]!.documentId,
        locale: "fr-FR",
        version: 1,
        publishedAt: updatedAt,
        publishedBy: "replica-atlas-reviewer",
      },
      {
        documentType: "atlasNode",
        documentId: "replica-atlas-wrong-version",
        locale: "en-GB",
        version: 2,
        publishedAt: updatedAt,
        publishedBy: "replica-atlas-reviewer",
      },
      {
        documentType: "atlasNode",
        documentId: "replica-atlas-draft",
        locale: "en-GB",
        version: 1,
        publishedAt: updatedAt,
        publishedBy: "replica-atlas-reviewer",
      },
    ]);

    const service = new CmsService(new CmsRepository(mongoose.connection));
    const english = await service.listPublicAtlas("en-GB");
    expect(english.items).toHaveLength(60);
    expect(english.items[0]).toMatchObject({
      slug: "replica-atlas-000",
      label: "Node 0",
      homepageProof: {
        order: 1,
        label: "Configured proof",
        emphasisFor: ["government", "media"],
      },
    });
    expect(english.items[59]).toMatchObject({
      slug: "replica-atlas-059",
      label: "Node 59",
    });
    expect(english.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "replica-atlas-060" }),
        expect.objectContaining({ slug: "replica-atlas-wrong-version" }),
        expect.objectContaining({ slug: "replica-atlas-draft" }),
      ]),
    );
    expect(english.translation).toEqual({
      stale: false,
      sourceUpdatedAt: updatedAt,
    });
    await expect(service.listPublicAtlas("fr-FR")).resolves.toEqual({
      items: [
        expect.objectContaining({
          slug: "replica-atlas-000",
          label: "Nœud 0",
          homepageProof: {
            order: 1,
            label: "Preuve configurée",
            emphasisFor: ["government", "media"],
          },
        }),
      ],
      translation: { stale: true, sourceUpdatedAt: updatedAt },
    });
  });

  it("lists only locale-published Speaking themes from exact published versions", async () => {
    const service = new CmsService(new CmsRepository(mongoose.connection));
    const localized = (en: string, fr: string) => ({
      "en-GB": en,
      "fr-FR": fr,
      status: { "en-GB": "current" as const, "fr-FR": "current" as const },
      sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const words = (count: number, stem: string) =>
      Array.from({ length: count }, (_, index) => `${stem}${index + 1}`).join(
        " ",
      );
    const payload = {
      slug: "public-value",
      title: localized("Public value", "Valeur publique"),
      summary: localized(words(60, "summary"), words(60, "resume")),
      audiences: [localized("Programme directors", "Directeurs de programme")],
      formats: ["keynote" as const, "institutional_briefing" as const],
      sourceRefs: ["official-record-1"],
      relatedNodes: [],
      featured: true,
      history: [
        {
          slug: "forum-2026",
          title: localized("Regional forum", "Forum régional"),
          host: localized("Public Value Forum", "Forum de la valeur publique"),
          date: new Date("2026-07-01T00:00:00.000Z"),
          city: "Accra",
          country: "Ghana",
          format: "keynote" as const,
          sourceRefs: ["official-record-1"],
        },
        {
          slug: "summit-2025",
          title: localized("Delivery summit", "Sommet de la mise en œuvre"),
          host: localized("Delivery Network", "Réseau de mise en œuvre"),
          date: new Date("2025-11-01T00:00:00.000Z"),
          city: "Dakar",
          country: "SN",
          format: "keynote" as const,
          sourceRefs: ["official-record-1"],
        },
      ],
    };
    const draft = await service.createDraft(
      "speakingTheme",
      "public-value",
      payload,
      { id: "speaking-editor", roles: ["editor"] },
    );
    await service.createDraft(
      "speakingTheme",
      "unpublished-theme",
      { ...payload, slug: "unpublished-theme" },
      { id: "speaking-editor", roles: ["editor"] },
    );
    const submitted = await service.transition(
      "speakingTheme",
      "public-value",
      draft.version,
      "submit",
      { id: "speaking-editor", roles: ["editor"] },
      {},
    );
    const approved = await service.transition(
      "speakingTheme",
      "public-value",
      submitted.version,
      "approve",
      { id: "speaking-reviewer", roles: ["reviewer"] },
      {},
    );
    await service.publish(
      "speakingTheme",
      "public-value",
      approved.version,
      "fr-FR",
      { id: "speaking-reviewer", roles: ["reviewer"] },
      new Date("2026-08-09T00:00:00.000Z"),
    );

    await expect(
      service.listPublicSpeakingThemes("fr-FR"),
    ).resolves.toMatchObject({
      items: [
        {
          documentId: "public-value",
          title: "Valeur publique",
          audiences: ["Directeurs de programme"],
          formats: ["keynote", "institutional_briefing"],
          history: expect.arrayContaining([
            expect.objectContaining({
              slug: "forum-2026",
              title: "Forum régional",
              host: "Forum de la valeur publique",
            }),
          ]),
        },
      ],
    });
    await expect(
      service.listPublicSpeakingThemes("en-GB"),
    ).resolves.toMatchObject({ items: [] });
  });
});
