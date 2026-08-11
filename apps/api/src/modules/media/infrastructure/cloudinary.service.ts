import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import type { VerifiedCloudinaryAsset } from "../domain/media";
import { z } from "zod";

export type SignedUpload = Readonly<{
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  resourceType: string;
  signature: string;
  uploadUrl: string;
  overwrite: false;
  uniqueFilename: true;
}>;

const resourceResponseSchema = z.object({
  public_id: z.string().min(1),
  secure_url: z
    .url()
    .refine((url) => url.startsWith("https://res.cloudinary.com/")),
  format: z.string().optional(),
  bytes: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
});
const destroyResponseSchema = z.object({ result: z.enum(["ok", "not found"]) });

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {
    const cloudName = configuration.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = configuration.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = configuration.get<string>("CLOUDINARY_API_SECRET");
    if (cloudName && apiKey && apiSecret)
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
  }

  signUpload(
    folder: string,
    resourceType: string,
    now = new Date(),
  ): SignedUpload {
    const cloudName = this.configuration.getOrThrow<string>(
      "CLOUDINARY_CLOUD_NAME",
    );
    const apiKey = this.configuration.getOrThrow<string>("CLOUDINARY_API_KEY");
    const apiSecret = this.configuration.getOrThrow<string>(
      "CLOUDINARY_API_SECRET",
    );
    const timestamp = Math.floor(now.getTime() / 1_000);
    const targetFolder = `amanor/${folder}`;
    const signature = cloudinary.utils.api_sign_request(
      {
        folder: targetFolder,
        overwrite: false,
        timestamp,
        unique_filename: true,
      },
      apiSecret,
    );
    return {
      cloudName,
      apiKey,
      timestamp,
      folder: targetFolder,
      resourceType,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
      overwrite: false,
      uniqueFilename: true,
    };
  }

  async verifyAsset(
    publicId: string,
    resourceType: "image" | "video" | "raw",
  ): Promise<VerifiedCloudinaryAsset> {
    const raw: unknown = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });
    const result = resourceResponseSchema.parse(raw);
    return {
      publicId: result.public_id,
      resourceType,
      secureUrl: result.secure_url,
      format: result.format ?? "unknown",
      bytes: result.bytes,
      version: result.version,
      ...(typeof result.width === "number" ? { width: result.width } : {}),
      ...(typeof result.height === "number" ? { height: result.height } : {}),
      ...(typeof result.duration === "number"
        ? { duration: result.duration }
        : {}),
    };
  }

  async destroy(
    publicId: string,
    resourceType: "image" | "video" | "raw",
  ): Promise<void> {
    const raw: unknown = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    destroyResponseSchema.parse(raw);
  }
}
