import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactEnquiryController } from "./contact-enquiry.controller";
import { ContactEnquiryService } from "./contact-enquiry.service";
import { ContactRateLimitGuard } from "./contact-rate-limit.guard";
import { UnsafeInputPipe } from "../../common/unsafe-input.pipe";

describe("ContactEnquiryController", () => {
  let app: INestApplication;
  const accept = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ContactEnquiryController],
      providers: [{ provide: ContactEnquiryService, useValue: { accept } }],
    })
      .overrideGuard(ContactRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    app.useGlobalPipes(
      new UnsafeInputPipe(),
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  it("rejects operator injection fields and never reflects submitted markup", async () => {
    const input = {
      name: "<script>alert(1)</script>",
      email: "ama@example.test",
      category: "general",
      subject: "Public record question",
      message:
        "<img src=x onerror=alert(1)> remains inert user-authored plain text.",
      locale: "en-GB",
      privacyConsent: true,
    };
    await request(app.getHttpServer())
      .post("/v1/public/contact-enquiries")
      .send({ ...input, $where: "sleep(10000)" })
      .expect(400);
    expect(accept).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post("/v1/public/contact-enquiries")
      .send({ ...input, name: { $ne: null } })
      .expect(400);
    expect(accept).not.toHaveBeenCalled();

    accept.mockResolvedValue("GC-2026-SAFE0001");
    const response = await request(app.getHttpServer())
      .post("/v1/public/contact-enquiries")
      .send(input)
      .expect(202);
    expect(accept).toHaveBeenCalledWith(input);
    expect(JSON.stringify(response.body)).not.toContain("script");
    expect(JSON.stringify(response.body)).not.toContain("onerror");
  });

  afterEach(async () => app.close());

  it("accepts a valid consented enquiry without caching the response", async () => {
    accept.mockResolvedValue("GC-2026-ABC12345");
    const response = await request(app.getHttpServer())
      .post("/v1/public/contact-enquiries")
      .send({
        name: "Ama Mensah",
        email: "ama@example.test",
        category: "general",
        subject: "Public record question",
        message: "A sufficiently detailed general contact message.",
        locale: "en-GB",
        privacyConsent: true,
      })
      .expect(202);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      reference: "GC-2026-ABC12345",
      status: "accepted",
    });
  });
});
