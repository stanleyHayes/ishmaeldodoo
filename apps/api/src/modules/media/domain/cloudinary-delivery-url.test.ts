import { describe, expect, it } from "vitest";
import { trustedCloudinaryDeliveryUrl } from "./cloudinary-delivery-url";

describe("trusted Cloudinary delivery URL", () => {
  it("accepts the exact HTTPS delivery host", () => {
    expect(
      trustedCloudinaryDeliveryUrl(
        "https://res.cloudinary.com/demo/image/upload/v1/portrait.jpg",
      )?.href,
    ).toBe("https://res.cloudinary.com/demo/image/upload/v1/portrait.jpg");
  });

  it.each([
    "http://res.cloudinary.com/demo/image/upload/portrait.jpg",
    "https://evilcloudinary.com/demo/image/upload/portrait.jpg",
    "https://res.cloudinary.com.evil.test/demo/image/upload/portrait.jpg",
    "https://res.cloudinary.com@attacker.test/portrait.jpg",
    "https://operator:secret@res.cloudinary.com/portrait.jpg",
    "https://res.cloudinary.com:8443/portrait.jpg",
    "not-a-url",
  ])("rejects untrusted delivery target %s", (value) => {
    expect(trustedCloudinaryDeliveryUrl(value)).toBeUndefined();
  });
});
