const cloudinaryDeliveryHost = "res.cloudinary.com";

export function trustedCloudinaryDeliveryUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === cloudinaryDeliveryHost &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
