import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { MigrationService } from "./migration.service";
import { TtlRetentionMonitorService } from "./ttl-retention-monitor.service";

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configuration: ConfigService) => ({
        uri: configuration.getOrThrow<string>("MONGODB_URI"),
        autoIndex: configuration.get<string>("NODE_ENV") !== "production",
        maxPoolSize: 20,
        minPoolSize:
          configuration.get<string>("NODE_ENV") === "production" ? 2 : 0,
        serverSelectionTimeoutMS: 5_000,
      }),
    }),
  ],
  providers: [MigrationService, TtlRetentionMonitorService],
  exports: [MongooseModule],
})
export class DatabaseModule {}
