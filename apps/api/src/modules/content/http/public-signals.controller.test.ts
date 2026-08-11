import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmsService } from "../application/cms.service";
import { PublicSignalsController } from "./public-signals.controller";

describe("PublicSignalsController", () => {
  let app: INestApplication;
  const cms = { latestPublicSignal: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PublicSignalsController],
      providers: [{ provide: CmsService, useValue: cms }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });

  afterEach(async () => app.close());

  it("returns the latest published Signal with shared-cache policy", async () => {
    cms.latestPublicSignal.mockResolvedValue({
      documentId: "signal-1",
      payload: { slug: "signal-1", body: "Current signal" },
      translation: { stale: false },
    });
    const response = await request(app.getHttpServer())
      .get("/v1/public/signals/latest?locale=fr-FR")
      .expect(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    expect(response.body).toMatchObject({
      documentId: "signal-1",
      body: "Current signal",
    });
    expect(cms.latestPublicSignal).toHaveBeenCalledWith("fr-FR");
  });

  it("collapses invalid locale and no-publication states to 404", async () => {
    cms.latestPublicSignal.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get("/v1/public/signals/latest?locale=en-GB")
      .expect(404);
    await request(app.getHttpServer())
      .get("/v1/public/signals/latest?locale=de-DE")
      .expect(404);
  });
});
