import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmsService } from "../application/cms.service";
import { PublicContentController } from "./public-content.controller";

describe("PublicContentController", () => {
  let app: INestApplication;
  const cms = { publicProjection: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PublicContentController],
      providers: [{ provide: CmsService, useValue: cms }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });
  afterEach(async () => app.close());

  it("returns only the published projection with shared-cache policy", async () => {
    cms.publicProjection.mockResolvedValue({
      publication: {
        documentType: "page",
        documentId: "home",
        locale: "en-GB",
        version: 3,
        publishedAt: new Date("2026-08-09T00:00:00Z"),
      },
      payload: { title: "Published" },
      translation: { stale: false },
    });
    const response = await request(app.getHttpServer())
      .get("/v1/public/content/page/home?locale=en-GB")
      .expect(200);
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.body).toEqual(
      expect.objectContaining({ version: 3, payload: { title: "Published" } }),
    );
    expect(cms.publicProjection).toHaveBeenCalledWith("page", "home", "en-GB");
  });

  it("uses the same 404 for invalid, missing and unpublished content", async () => {
    cms.publicProjection.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get("/v1/public/content/page/missing?locale=en-GB")
      .expect(404);
    await request(app.getHttpServer())
      .get("/v1/public/content/unknown/missing?locale=en-GB")
      .expect(404);
    await request(app.getHttpServer())
      .get("/v1/public/content/page/missing?locale=de-DE")
      .expect(404);
  });

  it("never exposes operational collections through the generic public route", async () => {
    await request(app.getHttpServer())
      .get("/v1/public/content/blackout/principal-travel?locale=en-GB")
      .expect(404);
    await request(app.getHttpServer())
      .get("/v1/public/content/counterparty/vendor-1?locale=en-GB")
      .expect(404);
    expect(cms.publicProjection).not.toHaveBeenCalled();
  });
});
