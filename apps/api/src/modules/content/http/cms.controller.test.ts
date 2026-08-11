import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtKeyService } from "../../auth/application/jwt-key.service";
import { AccessTokenGuard } from "../../auth/http/access-token.guard";
import { AuthRepository } from "../../auth/persistence/auth.repository";
import { CmsService } from "../application/cms.service";
import { CmsController } from "./cms.controller";
import { AdminMutationOriginGuard } from "../../../common/admin-mutation-origin.guard";

describe("CmsController HTTP permission boundary", () => {
  let app: INestApplication;
  const cms = {
    createDraft: vi.fn(),
    listVersions: vi.fn(),
    listDocuments: vi.fn(),
    transition: vi.fn(),
    publish: vi.fn(),
    rollback: vi.fn(),
    unpublish: vi.fn(),
    listAudit: vi.fn(),
    exportAudit: vi.fn(),
    verifyAuditIntegrity: vi.fn(),
  };
  const jwt = {
    verify: vi.fn().mockResolvedValue({
      subject: "editor-1",
      sessionId: "session-1",
      roles: ["editor"],
      roleVersion: 1,
      authenticationMethods: ["pwd", "totp"],
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CmsController],
      providers: [
        { provide: CmsService, useValue: cms },
        AccessTokenGuard,
        AdminMutationOriginGuard,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => "https://admin.example.test",
          },
        },
        { provide: JwtKeyService, useValue: jwt },
        {
          provide: AuthRepository,
          useValue: {
            findBySessionId: vi.fn().mockResolvedValue({
              sessionId: "session-1",
              userId: "editor-1",
              roleVersion: 1,
              expiresAt: new Date("2099-01-01"),
            }),
            findUserById: vi
              .fn()
              .mockResolvedValue({ userId: "editor-1", roleVersion: 1 }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it("rejects missing bearer proof before CMS code runs", async () => {
    await request(app.getHttpServer())
      .get("/v1/cms/content/source/source-1/versions")
      .expect(401);
    expect(cms.listVersions).not.toHaveBeenCalled();
  });

  it("rejects a protected mutation from a missing or lookalike Admin origin", async () => {
    const endpoint = "/v1/cms/content/source/source-1/versions";
    await request(app.getHttpServer())
      .post(endpoint)
      .set("Authorization", "Bearer signed")
      .send({ payload: { ref: "source-1" } })
      .expect(403);
    await request(app.getHttpServer())
      .post(endpoint)
      .set("Authorization", "Bearer signed")
      .set("Origin", "https://admin.example.test.evil")
      .send({ payload: { ref: "source-1" } })
      .expect(403);
    expect(cms.createDraft).not.toHaveBeenCalled();
  });

  it("lists a bounded page of documents and validates its cursor", async () => {
    cms.listDocuments.mockResolvedValue({ items: [], nextCursor: undefined });
    await request(app.getHttpServer())
      .get("/v1/cms/content/page?limit=25&cursor=home")
      .set("Authorization", "Bearer signed")
      .expect(200);
    expect(cms.listDocuments).toHaveBeenCalledWith("page", 25, "home");
    await request(app.getHttpServer())
      .get("/v1/cms/content/page?limit=101")
      .set("Authorization", "Bearer signed")
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/cms/content/page?cursor=not%20valid")
      .set("Authorization", "Bearer signed")
      .expect(400);
  });

  it("maps the authenticated actor and rejects unknown kinds or malformed payloads", async () => {
    cms.createDraft.mockResolvedValue({
      documentType: "source",
      documentId: "source-1",
      version: 1,
      state: "draft",
    });
    await request(app.getHttpServer())
      .post("/v1/cms/content/source/source-1/versions")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ payload: { ref: "source-1" } })
      .expect(201);
    expect(cms.createDraft).toHaveBeenCalledWith(
      "source",
      "source-1",
      { ref: "source-1" },
      expect.objectContaining({ id: "editor-1", roles: ["editor"] }),
    );

    await request(app.getHttpServer())
      .post("/v1/cms/content/unknown/source-1/versions")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ payload: {} })
      .expect(400);
    await request(app.getHttpServer())
      .post("/v1/cms/content/source/source-1/versions")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ payload: "invalid" })
      .expect(400);
  });

  it("returns forbidden for role and two-person approval failures", async () => {
    cms.transition.mockRejectedValue(
      new Error("Policy-sensitive content requires a different approver"),
    );
    const response = await request(app.getHttpServer())
      .post("/v1/cms/content/source/source-1/versions/1/actions")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ action: "approve", policySensitive: true })
      .expect(403);
    expect((response.body as { message: string }).message).toMatch(
      /different approver/i,
    );
  });

  it("maps least-privilege service denials to a safe forbidden response", async () => {
    cms.createDraft.mockRejectedValue(
      new Error(
        "content:write or content:translate permission is required to create a draft",
      ),
    );
    const response = await request(app.getHttpServer())
      .post("/v1/cms/content/source/source-1/versions")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ payload: { ref: "source-1" } })
      .expect(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      error: "Forbidden",
    });
    expect((response.body as { message: string }).message).toMatch(
      /permission is required/i,
    );
  });

  it("exposes bounded audit history without leaking an unbounded collection scan", async () => {
    cms.listAudit.mockResolvedValue([
      { eventId: "event-1", action: "created" },
    ]);
    await request(app.getHttpServer())
      .get("/v1/cms/content/source/source-1/audit?limit=25")
      .set("Authorization", "Bearer signed")
      .expect(200);
    expect(cms.listAudit).toHaveBeenCalledWith("source", "source-1", 25);
    await request(app.getHttpServer())
      .get("/v1/cms/content/source/source-1/audit?limit=1000")
      .set("Authorization", "Bearer signed")
      .expect(400);
  });

  it("exports audit evidence and maps the actor for rollback", async () => {
    cms.exportAudit.mockResolvedValue({
      format: "amanor-editorial-audit-v2",
      events: [],
      integrity: { status: "valid", checkedEvents: 0 },
    });
    await request(app.getHttpServer())
      .get("/v1/cms/content/source/source-1/audit/export?limit=200")
      .set("Authorization", "Bearer signed")
      .expect(200);
    expect(cms.exportAudit).toHaveBeenCalledWith("source", "source-1", 200);
    cms.rollback.mockResolvedValue({
      documentType: "source",
      documentId: "source-1",
      locale: "en-GB",
      version: 1,
    });
    await request(app.getHttpServer())
      .post("/v1/cms/content/source/source-1/versions/1/rollback")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ locale: "en-GB" })
      .expect(200);
    expect(cms.rollback).toHaveBeenCalledWith(
      "source",
      "source-1",
      1,
      "en-GB",
      expect.objectContaining({ id: "editor-1" }),
    );
  });

  it("exposes scoped editorial chain integrity", async () => {
    cms.verifyAuditIntegrity.mockResolvedValue({
      status: "valid",
      checkedEvents: 4,
      headSequence: 4,
    });
    await request(app.getHttpServer())
      .get("/v1/cms/content/source/source-1/audit/integrity")
      .set("Authorization", "Bearer signed")
      .expect(200)
      .expect({ status: "valid", checkedEvents: 4, headSequence: 4 });
    expect(cms.verifyAuditIntegrity).toHaveBeenCalledWith("source", "source-1");
  });

  it("maps authenticated takedown requests to the audited service", async () => {
    cms.unpublish.mockResolvedValue({
      documentType: "source",
      documentId: "source-1",
      locale: "en-GB",
      version: 1,
      unpublishedAt: new Date(),
    });
    await request(app.getHttpServer())
      .post("/v1/cms/content/source/source-1/unpublish")
      .set("Origin", "https://admin.example.test")
      .set("Authorization", "Bearer signed")
      .send({ locale: "en-GB" })
      .expect(200);
    expect(cms.unpublish).toHaveBeenCalledWith(
      "source",
      "source-1",
      "en-GB",
      expect.objectContaining({ id: "editor-1" }),
    );
  });
});
