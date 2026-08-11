import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CmsService } from "../application/cms.service";
import { PublicSourcesController } from "./public-sources.controller";

describe("PublicSourcesController", () => {
  let app: INestApplication;
  const cms = { listPublicSources: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PublicSourcesController],
      providers: [{ provide: CmsService, useValue: cms }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });
  afterEach(async () => app.close());

  it("returns a bounded public register page with shared-cache policy", async () => {
    cms.listPublicSources.mockResolvedValue({
      items: [
        {
          ref: "source-1",
          title: "Official record",
          publisher: "Institution",
          accessedAt: new Date("2026-08-09"),
          type: "official",
        },
      ],
    });
    const response = await request(app.getHttpServer())
      .get(
        "/v1/public/sources?locale=fr-FR&limit=20&q=official&cursor=source-0",
      )
      .expect(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    const body = response.body as { items: unknown[] };
    expect(body.items[0]).not.toHaveProperty("notes");
    expect(cms.listPublicSources).toHaveBeenCalledWith(
      "fr-FR",
      20,
      "source-0",
      "official",
    );
  });

  it("rejects invalid locales, limits, cursors and oversized searches", async () => {
    await request(app.getHttpServer())
      .get("/v1/public/sources?locale=de-DE")
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/public/sources?limit=51")
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/public/sources?cursor=not%20valid")
      .expect(400);
    await request(app.getHttpServer())
      .get(`/v1/public/sources?q=${"a".repeat(101)}`)
      .expect(400);
  });
});
