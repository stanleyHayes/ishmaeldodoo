import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmsService } from "../application/cms.service";
import { PublicArchiveController } from "./public-archive.controller";

describe("PublicArchiveController", () => {
  let app: INestApplication;
  const cms = { listPublicArchive: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PublicArchiveController],
      providers: [{ provide: CmsService, useValue: cms }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });

  afterEach(async () => app.close());

  it("returns the bounded published projection with shared-cache policy", async () => {
    cms.listPublicArchive.mockResolvedValue({
      items: [],
      translation: { stale: false },
    });
    const response = await request(app.getHttpServer())
      .get("/v1/public/archive?locale=fr-FR&q=priorities&type=broadcast")
      .expect(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    expect(cms.listPublicArchive).toHaveBeenCalledWith(
      "fr-FR",
      "priorities",
      "broadcast",
    );
  });

  it("rejects unsupported locales", async () => {
    await request(app.getHttpServer())
      .get("/v1/public/archive?locale=de-DE")
      .expect(404);
  });

  it("rejects unsupported types and overlong searches", async () => {
    await request(app.getHttpServer())
      .get("/v1/public/archive?type=private")
      .expect(404);
    await request(app.getHttpServer())
      .get(`/v1/public/archive?q=${"a".repeat(101)}`)
      .expect(404);
  });
});
