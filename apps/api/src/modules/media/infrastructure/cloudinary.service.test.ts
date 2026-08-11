import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { CloudinaryService } from "./cloudinary.service";

describe("CloudinaryService signing", () => {
  it("returns short-lived upload material without exposing the API secret", () => {
    const secret = "cloudinary-secret-value";
    const service = new CloudinaryService(
      new ConfigService({
        CLOUDINARY_CLOUD_NAME: "amanor-cloud",
        CLOUDINARY_API_KEY: "12345",
        CLOUDINARY_API_SECRET: secret,
      }),
    );
    const signed = service.signUpload(
      "portraits",
      "image",
      new Date("2026-08-09T19:00:00.000Z"),
    );
    expect(signed).toEqual(
      expect.objectContaining({
        cloudName: "amanor-cloud",
        apiKey: "12345",
        folder: "amanor/portraits",
        timestamp: 1786302000,
        overwrite: false,
        uniqueFilename: true,
      }),
    );
    expect(signed.signature).toMatch(/^[a-f0-9]{40}$/u);
    expect(JSON.stringify(signed)).not.toContain(secret);
  });
});
