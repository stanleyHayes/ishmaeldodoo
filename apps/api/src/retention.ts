import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import mongoose from "mongoose";
import { MediaRetentionService } from "./modules/media/application/media-retention.service";
import { CloudinaryService } from "./modules/media/infrastructure/cloudinary.service";
import { MediaRepository } from "./modules/media/persistence/media.repository";
import { ProtocolDeskRetentionService } from "./modules/protocol-desk/application/protocol-desk-retention.service";

async function retain(): Promise<void> {
  const uri = process.env.MONGODB_RETENTION_URI;
  if (!uri)
    throw new Error(
      "MONGODB_RETENTION_URI is required for the one-shot retention command",
    );
  const cloudName = process.env.CLOUDINARY_RETENTION_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_RETENTION_API_KEY;
  const apiSecret = process.env.CLOUDINARY_RETENTION_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret)
    throw new Error(
      "CLOUDINARY_RETENTION_CLOUD_NAME, CLOUDINARY_RETENTION_API_KEY and CLOUDINARY_RETENTION_API_SECRET are required for the one-shot retention command",
    );
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 2,
  });
  try {
    const protocolResult = await new ProtocolDeskRetentionService(
      mongoose.connection,
    ).run();
    const mediaResult = await new MediaRetentionService(
      new MediaRepository(mongoose.connection),
      new CloudinaryService(
        new ConfigService({
          CLOUDINARY_CLOUD_NAME: cloudName,
          CLOUDINARY_API_KEY: apiKey,
          CLOUDINARY_API_SECRET: apiSecret,
        }),
      ),
    ).run();
    process.stdout.write(
      `Protocol Desk retention: ${protocolResult.pseudonymised} pseudonymised, ${protocolResult.failed} failed\n` +
        `Media retention: ${mediaResult.deleted} deleted, ${mediaResult.referenced} referenced, ${mediaResult.failed} failed\n`,
    );
    if (protocolResult.failed > 0 || mediaResult.failed > 0)
      process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void retain().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "MongoDB retention failed"}\n`,
  );
  process.exitCode = 1;
});
