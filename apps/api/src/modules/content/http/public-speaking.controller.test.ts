import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmsService } from "../application/cms.service";
import { PublicSpeakingController } from "./public-speaking.controller";

describe("PublicSpeakingController", () => {
  let app: INestApplication;
  const cms = { listPublicSpeakingThemes: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PublicSpeakingController],
      providers: [{ provide: CmsService, useValue: cms }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });

  afterEach(async () => app.close());

  it("returns the bounded published projection with shared-cache policy", async () => {
    cms.listPublicSpeakingThemes.mockResolvedValue({
      items: [],
      translation: { stale: false },
    });
    const response = await request(app.getHttpServer())
      .get("/v1/public/speaking?locale=fr-FR")
      .expect(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    expect(cms.listPublicSpeakingThemes).toHaveBeenCalledWith("fr-FR");
  });

  it("rejects unsupported locales", async () => {
    await request(app.getHttpServer())
      .get("/v1/public/speaking?locale=de-DE")
      .expect(404);
  });
});
